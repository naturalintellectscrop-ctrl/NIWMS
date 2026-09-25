'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { Toaster, toast } from 'sonner'
import { format, subMonths, addMonths, parseISO } from 'date-fns'
import {
  FileText, Send, Users, Download,
  ChevronLeft, ChevronRight, LogOut, Menu, Plus, Pencil,
  Trash2, Loader2, CalendarDays, UserCheck, AlertCircle,
  Search, X, CheckCircle2, Clock,
  UserCircle, Eye, EyeOff, ChevronDown,
  Clapperboard, Shield, Bell, HelpCircle, ArrowRight,
  Lock, LayoutDashboard, ClipboardCheck, CircleUser,
  ChevronUp, TrendingUp, Settings, MessageSquare,
  Info, Globe, Phone, Mail, BookOpen, MonitorSmartphone, Save,
  BarChart3, RefreshCw, UsersRound, Archive, Trophy, Flame, KeyRound, Check,
} from 'lucide-react'

import { useAuthStore, type User } from '@/store/auth-store'
import { useTranslation } from '@/lib/i18n'
import { apiPost, apiGet, apiPut, apiDelete, apiPatch, ApiError } from '@/lib/api'
import type { MonthlyReportListItem, MonthlyReportDetail, BulkGenerateResult, PaginatedReports as MonthlyPaginatedReports } from '@/types/report'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { Calendar as CalendarComponent } from '@/components/ui/calendar'
import { VoiceRecorder } from '@/components/voice-recorder'
import {
  Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader, SheetDescription,
} from '@/components/ui/sheet'

// =====================================================================
// TYPES
// =====================================================================

interface DailyReport {
  id: string
  userId: string
  date: string
  activityText: string
  location?: string | null
  timeIn?: string | null
  timeOut?: string | null
  comments?: string | null
  createdAt: string
  user?: {
    id: string
    username: string
    role: string
    status: string
    profile?: { employeeId?: string; position?: string }
  }
}

interface Employee {
  id: string
  username: string
  role: string
  status: string
  createdAt: string
  profile?: { employeeId?: string; position?: string }
  _count?: { reports: number }
}

interface AdminStats {
  totalEmployees: number
  activeEmployees: number
  suspendedEmployees: number
  totalReports: number
  todayReports: number
  monthReports: number
  currentMonth: string
  today: string
  positionBreakdown: { position: string; count: number }[]
  topReporters?: { username: string; position: string; count: number; lastDate: string }[]
  reportsTrend: { date: string; count: number }[]
  missingTodayReports: { id: string; username: string; profile?: { employeeId?: string; position?: string } }[]
  recentReports: DailyReport[]
}

interface DailyPaginatedReports {
  reports: DailyReport[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

interface EmployeesData {
  employees: Employee[]
  positions: string[]
}

type EmployeeView = 'submit' | 'my-reports' | 'monthly-reports' | 'settings'
type AdminView = 'overview' | 'employees' | 'reports' | 'monthly-reports' | 'export' | 'settings'

// =====================================================================
// QUERY CLIENT
// =====================================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

// =====================================================================
// LIFECYCLE CHIP — workspace sidebar status (trial / complimentary / paused)
// =====================================================================

function LifecycleChip({ user }: { user: User | null }) {
  const mode = user?.billingMode
  const status = user?.lifecycleStatus
  const trialEndsAt = user?.trialEndsAt
  const daysLeft = trialEndsAt ? Math.ceil((new Date(trialEndsAt).getTime() - Date.now()) / 86_400_000) : null

  // Compact labels: the sidebar user block is narrow — detail lives in the tooltip.
  let chip = 'border-white/15 bg-white/5 text-white/60'
  let label = 'Active'
  let title = 'Plan and billing · Active'
  if (mode === 'exempt') {
    chip = 'border-[#7fc9a6]/40 bg-[#7fc9a6]/10 text-[#a9e3c6]'
    label = 'Complimentary'
    title = 'Complimentary access — no payment required, never paused'
  } else if (status === 'trial' && daysLeft !== null) {
    chip = 'border-[#e9b44c]/40 bg-[#e9b44c]/10 text-[#f0c26a]'
    label = daysLeft >= 0 ? `Trial · ${daysLeft}d left` : 'Trial ended'
    title = daysLeft >= 0
      ? `14-day free trial — ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining`
      : 'Trial ended — update billing to reactivate'
  } else if (status === 'grace') {
    chip = 'border-[#e2705f]/40 bg-[#e2705f]/10 text-[#f0a08f]'
    label = 'Paused'
    title = 'Paused — data held for 30 days, update billing to reactivate'
  } else if (status === 'suspended' || status === 'banned') {
    chip = 'border-[#e2705f]/50 bg-[#e2705f]/15 text-[#f0a08f]'
    label = 'Disabled'
    title = 'Access disabled by the platform owner'
  }

  return (
    <Link
      href="/app/billing"
      title={title}
      className={`mt-1.5 inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider transition-colors hover:bg-white/10 ${chip}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </Link>
  )
}

// =====================================================================
// NAVIGATION ITEMS
// =====================================================================

const adminNavItems: { key: AdminView; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Overview', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'employees', label: 'Employees', icon: <Users className="h-4 w-4" /> },
  { key: 'reports', label: 'Reports', icon: <FileText className="h-4 w-4" /> },
  { key: 'monthly-reports', label: 'Monthly Reports', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'export', label: 'Export', icon: <Download className="h-4 w-4" /> },
  { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

const employeeNavItems: { key: EmployeeView; label: string; icon: React.ReactNode }[] = [
  { key: 'submit', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: 'my-reports', label: 'My Reports', icon: <FileText className="h-4 w-4" /> },
  { key: 'monthly-reports', label: 'Monthly Report', icon: <BarChart3 className="h-4 w-4" /> },
  { key: 'settings', label: 'Settings', icon: <Settings className="h-4 w-4" /> },
]

// =====================================================================
// HELP CENTER DIALOG
// =====================================================================

function HelpCenterDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null)
  const user = useAuthStore((s) => s.user)

  const faqs = [
    {
      q: 'How do I submit a daily report?',
      a: 'Go to the Dashboard (employee view) and fill out the Daily Activity Report form. Select the date, describe your activities, and click "Submit Report". You can only submit one report per day.',
    },
    {
      q: 'What is the daily report deadline?',
      a: `Reports should be submitted by ${formatDeadlineLabel(user?.reportDeadline)} daily (your organization's local time). The system tracks consistent reporting for performance review purposes.`,
    },
    {
      q: 'How do I reset my password?',
      a: `Go to Settings and use the "Password reset request" card, or contact your organization administrator directly. They will review your request and update your credentials.`,
    },
    {
      q: 'Can I edit or delete a submitted report?',
      a: 'Yes, go to "My Reports" and use the edit (pencil) or delete (trash) icons next to any report. Note that deleted reports cannot be recovered.',
    },
    {
      q: 'How do admins export reports?',
      a: 'Navigate to the "Export" section in the admin dashboard. Select the desired month and click "Download Excel" to get a comprehensive Excel file with all reports.',
    },
    {
      q: 'How do I change my account settings?',
      a: 'Click on "Settings" in the sidebar navigation. There you can update your password, view your account information, and manage display preferences.',
    },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="overflow-y-auto" aria-label="Help Center">
        <SheetHeader className="px-6 pt-8">
          <SheetTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <HelpCircle className="h-5 w-5 text-[#123c36]" />
            Help Center
          </SheetTitle>
          <SheetDescription>Find answers to common questions and contact support</SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-8 space-y-6">
          {/* FAQ Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-[#123c36]" />
              Frequently Asked Questions
            </h3>
            <div className="space-y-2">
              {faqs.map((faq, i) => (
                <div key={i} className="rounded-lg border border-gray-200 overflow-hidden">
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="w-full flex items-center justify-between gap-3 p-3 text-left hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-medium text-gray-700">{faq.q}</span>
                    <ChevronDown className={`h-4 w-4 text-gray-400 shrink-0 transition-transform ${expandedFaq === i ? 'rotate-180' : ''}`} />
                  </button>
                  {expandedFaq === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="px-3 pb-3"
                    >
                      <p className="text-sm text-gray-500 leading-relaxed">{faq.a}</p>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Contact Information */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-[#123c36]" />
              Contact Support
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <Mail className="h-4 w-4 text-[#123c36]" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Email</p>
                  <p className="text-xs text-gray-500">ugandafmi3@gmail.com</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <Phone className="h-4 w-4 text-[#123c36]" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Phone</p>
                  <p className="text-xs text-gray-500">+256782823117</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <MonitorSmartphone className="h-4 w-4 text-[#123c36]" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Office Hours</p>
                  <p className="text-xs text-gray-500">Mon - Fri, 8:00 AM - 5:00 PM EAT</p>
                </div>
              </div>
            </div>
          </div>

          {/* System Info */}
          <div className="rounded-xl bg-[#123c36]/5 border border-[#123c36]/10 p-4">
            <h3 className="text-sm font-semibold text-[#123c36] flex items-center gap-2 mb-2">
              <Info className="h-4 w-4" />
              System Information
            </h3>
            <div className="space-y-1.5 text-xs text-gray-500">
              <p><span className="font-medium text-gray-700">Version:</span> 2.1.0</p>
              <p><span className="font-medium text-gray-700">Platform:</span> Natural Intellects Workforce Platform</p>
              <p><span className="font-medium text-gray-700">Developed by:</span> Natural Intellects Ltd</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
// =====================================================================
// FORGOT PASSWORD DIALOG
// =====================================================================

function ForgotPasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [step, setStep] = useState<'form' | 'success'>('form')
  const [username, setUsername] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { t } = useTranslation()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await apiPost('/api/auth/forgot-password', {
        username: username.trim(),
        message: message.trim() || undefined,
      })
      setStep('success')
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message)
      } else {
        setError(t('login.error'))
      }
    } finally {
      setLoading(false)
    }
  }

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setStep('form')
      setUsername('')
      setMessage('')
      setError('')
    }
    onOpenChange(isOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {step === 'success' ? t('forgot.title') : t('login.forgotPassword')}
          </DialogTitle>
          <DialogDescription>
            {step === 'success'
              ? t('forgot.description')
              : t('forgot.description')}
          </DialogDescription>
        </DialogHeader>

        {step === 'success' ? (
          <div className="flex flex-col items-center py-6 gap-4">
            <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-green-600" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-semibold text-gray-900">{t('forgot.success')}</p>
              <p className="text-xs text-gray-500">
                {t('forgot.successMessage')}
              </p>
            </div>
            <Button onClick={() => handleClose(false)} className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg">
              {t('forgot.backToLogin')}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">{t('forgot.username')}</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('forgot.usernamePlaceholder')}
                required
                className="h-10 rounded-lg border-gray-200"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">{t('forgot.message')} <span className="text-gray-400 font-normal">{t('forgot.messageOptional')}</span></Label>
              <Textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t('forgot.messagePlaceholder')}
                rows={3}
                className="rounded-lg border-gray-200 resize-none"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => handleClose(false)} className="flex-1 rounded-lg border-gray-200">
                {t('forgot.cancel')}
              </Button>
              <Button type="submit" disabled={loading} className="flex-1 bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg">
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('forgot.submitting')}
                  </>
                ) : (
                  t('forgot.submitRequest')
                )}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================
// SIDEBAR
// =====================================================================

function Sidebar({
  isAdmin,
  currentView,
  onNavigate,
  onLogout,
  collapsed,
  onToggle,
  onHelpOpen,
}: {
  isAdmin: boolean
  currentView: string
  onNavigate: (view: string) => void
  onLogout: () => void
  collapsed: boolean
  onToggle: () => void
  onHelpOpen: () => void
}) {
  const items = isAdmin ? adminNavItems : employeeNavItems
  const user = useAuthStore((s) => s.user)
  const { t } = useTranslation()

  return (
    <aside
      className="hidden lg:flex flex-col fixed left-0 top-0 bottom-0 z-40 transition-all duration-300"
      style={{
        width: collapsed ? '72px' : '250px',
        background: '#102f2b',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 shrink-0">
        <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0">
          <Image src="/logo.png" alt="Natural Intellects logo" width={36} height={36} className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-white leading-none tracking-tight">NIWMS</h1>
            <p className="text-[10px] text-[#9ab8b1]/80 mt-0.5">Natural Intellects</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto sidebar-scrollbar py-4 px-3 space-y-1">
        {!collapsed && isAdmin && (
          <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider px-3 mb-2">{t('sidebar.navigation')}</p>
        )}
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onNavigate(item.key)}
            className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium transition-all duration-200 ${
              collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
            } ${
              currentView === item.key
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-white/70 hover:bg-white/8 hover:text-white'
            }`}
            title={collapsed ? item.label : undefined}
          >
            {item.icon}
            {!collapsed && item.label}
          </button>
        ))}
      </nav>

      {/* Bottom actions */}
      <div className="border-t border-white/10 p-3 space-y-1">
        {isAdmin && (
          <button
            onClick={() => onNavigate('overview')}
            className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-white bg-[#c47b32]/90 hover:bg-[#c47b32] transition-all ${
              collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
            }`}
            title={collapsed ? t('nav.submitReport') : undefined}
          >
            <Send className="h-4 w-4" />
            {!collapsed && t('nav.submitReport')}
          </button>
        )}

        {!collapsed && (
          <button onClick={onHelpOpen} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/8 hover:text-white transition-all">
            <HelpCircle className="h-4 w-4" />
            {t('nav.helpCenter')}
          </button>
        )}

        {collapsed && (
          <button onClick={onHelpOpen} className="w-full flex items-center justify-center px-2 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/8 hover:text-white transition-all" title={t('nav.helpCenter')}>
            <HelpCircle className="h-4 w-4" />
          </button>
        )}

        <button
          onClick={onLogout}
          className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-red-300/80 hover:bg-red-500/15 hover:text-red-300 transition-all ${
            collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
          }`}
          title={collapsed ? t('nav.signOut') : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && t('nav.signOut')}
        </button>
      </div>

      {/* User info */}
      {!collapsed && (
        <div className="border-t border-white/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0">
              <span className="text-xs font-bold text-white uppercase">
                {(user?.username || 'U').charAt(0)}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{user?.username}</p>
              <p className="text-[10px] text-[#9ab8b1]/80 truncate" title={user?.organizationName}>
                {user?.organizationName || 'Your organization'}
              </p>
              <p className="text-[10px] text-white/50">
                {user?.role === 'admin' ? t('sidebar.administrator') : (user?.profile?.position || user?.role)}
              </p>
              <LifecycleChip user={user} />
            </div>
          </div>
        </div>
      )}

      {/* Copyright */}
      {!collapsed && (
        <div className="px-4 pb-3">
          <p className="text-[9px] text-white/30 leading-tight">
            &copy; {new Date().getFullYear()} Natural Intellects Ltd
          </p>
        </div>
      )}

      {/* Collapse toggle */}
      <button
        onClick={onToggle}
        className="absolute -right-3 top-20 w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center shadow-sm hover:bg-gray-50 transition-colors z-50"
      >
        {collapsed ? <ChevronRight className="h-3 w-3 text-gray-500" /> : <ChevronLeft className="h-3 w-3 text-gray-500" />}
      </button>
    </aside>
  )
}

// =====================================================================
// MOBILE SIDEBAR (Sheet)
// =====================================================================

function MobileSidebar({
  isAdmin,
  currentView,
  onNavigate,
  onLogout,
  open,
  onOpenChange,
  onHelpOpen,
}: {
  isAdmin: boolean
  currentView: string
  onNavigate: (view: string) => void
  onLogout: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
  onHelpOpen: () => void
}) {
  const items = isAdmin ? adminNavItems : employeeNavItems
  const user = useAuthStore((s) => s.user)
  const { t } = useTranslation()

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="p-0 w-[260px]" style={{ background: '#102f2b' }}>
        <SheetTitle className="sr-only">{t('sidebar.navigation')}</SheetTitle>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl overflow-hidden">
            <Image src="/logo.png" alt="Natural Intellects logo" width={36} height={36} className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">NIWMS</h1>
            <p className="text-[10px] text-[#9ab8b1]/80 mt-0.5">Natural Intellects</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="py-4 px-3 space-y-1">
          {isAdmin && (
            <p className="text-[10px] font-semibold text-white/40 uppercase tracking-wider px-3 mb-2">{t('sidebar.navigation')}</p>
          )}
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => { onNavigate(item.key); onOpenChange(false) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                currentView === item.key
                  ? 'bg-white/15 text-white'
                  : 'text-white/70 hover:bg-white/8 hover:text-white'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Bottom */}
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/10 p-3 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
              <span className="text-xs font-bold text-white uppercase">{(user?.username || 'U').charAt(0)}</span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user?.username}</p>
              <p className="text-[10px] text-white/50">
                {user?.role === 'admin' ? t('sidebar.administrator') : (user?.profile?.position || user?.role)}
              </p>
            </div>
          </div>
          <button
            onClick={() => { onHelpOpen(); onOpenChange(false) }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/8 hover:text-white transition-all"
          >
            <HelpCircle className="h-4 w-4" />
            {t('nav.helpCenter')}
          </button>
          <button
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-300/80 hover:bg-red-500/15 hover:text-red-300 transition-all"
          >
            <LogOut className="h-4 w-4" />
            {t('nav.signOut')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// =====================================================================
// TOP HEADER BAR
// =====================================================================

// "16:00" -> "4:00 PM"; falls back to the product default deadline.
function formatDeadlineLabel(deadline?: string | null): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec((deadline ?? '').trim())
  if (!match) return '4:00 PM'
  const hours = Number(match[1])
  if (Number.isNaN(hours) || hours > 23) return '4:00 PM'
  return `${hours % 12 === 0 ? 12 : hours % 12}:${match[2]} ${hours >= 12 ? 'PM' : 'AM'}`
}

/**
 * Friendly greeting name for the welcome card: usernames are emails today
 * ("syntheticorga.employee1@example.test"), so derive the human-most segment —
 * the text after the last dot in the local part — and title-case it
 * ("Employee1"). Falls back to the raw username when nothing cleaner emerges.
 */
function formatDisplayName(user: { username: string } | null | undefined): string {
  if (!user?.username) return 'there'
  const raw = user.username
  if (!raw.includes('@')) return raw
  const local = raw.split('@')[0]
  const segments = local.split(/[._-]+/).filter(Boolean)
  const chosen = segments[segments.length - 1] ?? local
  if (!chosen) return raw
  return chosen.charAt(0).toUpperCase() + chosen.slice(1)
}

// Notification row relative timestamps ("Just now", "5m ago", "2h ago", "3d ago");
// absolute date fallback for anything older than a week.
function timeAgo(iso: string): string {
  try {
    const then = parseISO(iso).getTime()
    if (Number.isNaN(then)) return ''
    const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000))
    if (seconds < 60) return 'Just now'
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ago`
    const hours = Math.floor(minutes / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    if (days < 7) return `${days}d ago`
    return format(parseISO(iso), 'MMM d, yyyy')
  } catch {
    return ''
  }
}

function TopHeader({
  onMenuToggle,
  mobileOpen,
  onMobileOpenChange,
  isAdmin,
  currentView,
  onNavigate,
  onSearch,
  onHelpOpen,
}: {
  onMenuToggle: () => void
  mobileOpen: boolean
  onMobileOpenChange: (open: boolean) => void
  isAdmin: boolean
  currentView?: string
  onNavigate?: (view: string) => void
  onSearch?: (query: string) => void
  onHelpOpen?: () => void
}) {
  const user = useAuthStore((s) => s.user)
  const [searchValue, setSearchValue] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  // "/" focuses the search from anywhere (ignored while typing in a field)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable || target.tagName === 'SELECT')) return
      e.preventDefault()
      searchInputRef.current?.focus()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
  const { t } = useTranslation()

  // Real notifications from API
  const { data: notifData, isLoading: notifLoading } = useQuery<{ notifications: Array<{ id: string; title: string; message: string; type: string; read: boolean; createdAt: string }>; unreadCount: number }>({
    queryKey: ['notifications'],
    queryFn: () => apiGet('/api/notifications'),
    refetchInterval: 60000, // refresh every minute
  })
  const notifications = notifData?.notifications || []
  const unreadCount = notifData?.unreadCount || 0

  // Admin: also fetch password reset requests
  const { data: resetData } = useQuery<{ requests: Array<{
    id: string; username: string; status: string; message: string | null; createdAt: string;
    user?: { profile?: { employeeId?: string; position?: string } }
  }>; pendingCount: number }>({
    queryKey: ['password-resets-pending'],
    queryFn: () => apiGet('/api/admin/password-resets?status=pending'),
    enabled: isAdmin,
    refetchInterval: 30000,
  })
  const pendingResets = resetData?.pendingCount || 0
  const resetRequests = resetData?.requests || []

  const totalBadge = isAdmin ? (unreadCount + pendingResets) : unreadCount

  const markAllRead = async () => {
    await apiPost('/api/notifications', { action: 'mark-all-read' })
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  const markOneRead = async (id: string) => {
    await apiPatch(`/api/notifications/${id}`, {})
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (!searchValue.trim()) return
    if (onSearch) {
      onSearch(searchValue.trim())
    }
    setSearchValue('')
  }

  return (
    <>
      <header className="sticky top-0 z-30 w-full h-[68px] bg-white/95 backdrop-blur border-b border-[#dce4e1] flex items-center px-4 lg:px-8 gap-4">
        {/* Mobile menu button */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb / Title */}
        <div className="hidden lg:block">
          <p className="text-xs text-gray-400">Workspace</p>
          <p className="text-sm font-semibold text-gray-900">Natural Intellects</p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              ref={searchInputRef}
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') { setSearchValue(''); (e.target as HTMLInputElement).blur() } }}
              placeholder={isAdmin ? 'Search employees, reports, or positions...' : 'Search my reports...'}
              aria-label={isAdmin ? 'Search employees, reports, or positions' : 'Search my reports'}
              className="h-10 pl-10 pr-9 rounded-lg border-gray-200 bg-gray-50/50 text-sm focus:bg-white"
            />
            <kbd className="hidden sm:flex absolute right-2.5 top-1/2 -translate-y-1/2 items-center justify-center h-5 min-w-[20px] rounded border border-gray-200 bg-white text-[10px] font-semibold text-gray-400 pointer-events-none select-none">
              /
            </kbd>
          </div>
        </form>

        {/* Right side */}
        <div className="flex items-center gap-2">
          {/* Notification Bell */}
          <button
            onClick={() => setNotifOpen(true)}
            className="relative flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <Bell className="h-4 w-4" />
            {totalBadge > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-[#c47b32] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {totalBadge > 99 ? '99+' : totalBadge}
              </span>
            ) : null}
          </button>

          {/* Help button (desktop) */}
          {onHelpOpen && (
            <button
              onClick={onHelpOpen}
              className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
            >
              <HelpCircle className="h-4 w-4" />
            </button>
          )}

          <Separator orientation="vertical" className="h-8 mx-1 hidden sm:block" />

          {/* User */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-[#123c36] flex items-center justify-center">
              <span className="text-xs font-bold text-white uppercase">{(user?.username || 'U').charAt(0)}</span>
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-900 leading-none">{user?.username}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {user?.role === 'admin' ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="px-1.5 py-0.5 bg-[#123c36] text-white text-[9px] font-bold rounded leading-none">ADMIN</span>
                    <span className="ml-0.5">Administrator</span>
                  </span>
                ) : (
                  user?.profile?.position || user?.role
                )}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Notification Sheet */}
      <Sheet open={notifOpen} onOpenChange={setNotifOpen}>
        <SheetContent side="right" className="overflow-y-auto" aria-label="Notifications">
          <SheetHeader className="px-6 pt-8">
            <SheetTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Bell className="h-5 w-5 text-[#123c36]" />
              {t('notifications.title')}
            </SheetTitle>
            <SheetDescription>
              {isAdmin ? 'Password reset requests & system updates' : 'System notifications & reminders'}
            </SheetDescription>
          </SheetHeader>

          <div className="px-6 pb-8">
            {notifLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 text-gray-400 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3 mt-4">
                {/* Real Notifications */}
                {notifications.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Notifications</h3>
                      {unreadCount > 0 && (
                        <button onClick={markAllRead} className="text-[10px] font-semibold text-[#123c36] bg-[#123c36]/5 hover:bg-[#123c36]/10 border border-[#123c36]/15 rounded-full px-2.5 py-1 transition-colors">
                          {t('notifications.markAllRead')}
                        </button>
                      )}
                    </div>
                    <ScrollArea className="max-h-[400px]">
                      <div className="space-y-2">
                        {notifications.slice(0, 20).map((notif) => {
                          const iconBg = notif.type === 'warning' ? 'bg-amber-50' : notif.type === 'success' ? 'bg-green-50' : notif.type === 'announcement' ? 'bg-purple-50' : notif.type === 'reminder' ? 'bg-[#c47b32]/10' : 'bg-gray-50'
                          const iconColor = notif.type === 'warning' ? 'text-amber-500' : notif.type === 'success' ? 'text-green-600' : notif.type === 'announcement' ? 'text-purple-500' : notif.type === 'reminder' ? 'text-[#c47b32]' : 'text-gray-500'
                          const IconComp = notif.type === 'warning' ? AlertCircle : notif.type === 'success' ? CheckCircle2 : notif.type === 'reminder' ? Clock : Info
                          return (
                            <button
                              key={notif.id}
                              onClick={() => { if (!notif.read) markOneRead(notif.id) }}
                              className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border border-l-2 transition-colors ${notif.read ? 'border-transparent border-l-transparent opacity-60 hover:opacity-80' : 'border-gray-100 border-l-[#c47b32] bg-gray-50/50 hover:bg-gray-50'}`}
                            >
                              <div className={`w-9 h-9 rounded-full ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
                                <IconComp className={`h-4 w-4 ${iconColor}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm font-medium text-gray-900 ${!notif.read ? 'font-semibold' : ''}`}>{notif.title}</p>
                                  {!notif.read && <span className="w-2 h-2 rounded-full bg-[#c47b32] shrink-0" />}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line line-clamp-3">{notif.message}</p>
                                <p className="text-[10px] text-gray-400 mt-1 tabular-nums">
                                  {timeAgo(notif.createdAt)}
                                </p>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    </ScrollArea>
                  </>
                )}

                {/* Admin: Password Reset Requests */}
                {isAdmin && (
                  <>
                    {notifications.length > 0 && <Separator className="my-2" />}
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Password Reset Requests</h3>
                    {resetRequests.length === 0 ? (
                      <div className="flex flex-col items-center py-4">
                        <CheckCircle2 className="h-8 w-8 text-green-400 mb-1.5" />
                        <p className="text-sm text-gray-500 font-medium">{t('notifications.noRequests')}</p>
                      </div>
                    ) : (
                      <ScrollArea className="max-h-[300px]">
                        <div className="space-y-2">
                          {resetRequests.map((req) => (
                            <div key={req.id} className="flex items-start gap-3 p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                              <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0 mt-0.5">
                                <Lock className="h-4 w-4 text-amber-500" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-gray-900">{req.username}</p>
                                  {req.user?.profile?.position && (
                                    <span className="text-xs text-gray-400">{req.user.profile.position}</span>
                                  )}
                                </div>
                                {req.message && (
                                  <p className="text-xs text-gray-500 truncate mt-0.5">&ldquo;{req.message}&rdquo;</p>
                                )}
                                <p className="text-[10px] text-gray-400 mt-1 tabular-nums" title={format(parseISO(req.createdAt), 'MMM d, yyyy \'at\' h:mm a')}>
                                  {timeAgo(req.createdAt)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </ScrollArea>
                    )}
                  </>
                )}

                {/* Empty state */}
                {notifications.length === 0 && (!isAdmin || resetRequests.length === 0) && (
                  <div className="flex flex-col items-center py-8">
                    <CheckCircle2 className="h-10 w-10 text-green-400 mb-2" />
                    <p className="text-sm text-gray-500 font-medium">{t('notifications.allCaughtUp')}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t('notifications.noNotifications')}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Mobile sidebar */}
      <MobileSidebar
        isAdmin={isAdmin}
        currentView={currentView || (isAdmin ? 'overview' : 'submit')}
        onNavigate={(view) => { onNavigate?.(view) }}
        onLogout={() => useAuthStore.getState().logout()}
        open={mobileOpen}
        onOpenChange={onMobileOpenChange}
        onHelpOpen={onHelpOpen || (() => {})}
      />
    </>
  )
}

// =====================================================================
// BREADCRUMB
// =====================================================================

function Breadcrumb({ items }: { items: string[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm mb-1">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight className="h-3 w-3 text-gray-400" />}
          <span className={i === items.length - 1 ? 'text-gray-900 font-medium' : 'text-gray-400'}>
            {item}
          </span>
        </span>
      ))}
    </nav>
  )
}

// =====================================================================
// STATUS BADGE HELPER
// =====================================================================

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-50 text-green-700 border-green-200 rounded-full px-2.5 text-xs font-medium">Active</Badge>
    case 'suspended':
      return <Badge className="bg-amber-50 text-amber-700 border-amber-200 rounded-full px-2.5 text-xs font-medium">Suspended</Badge>
    default:
      return <Badge className="bg-gray-100 text-gray-600 border-gray-200 rounded-full px-2.5 text-xs font-medium">Archived</Badge>
  }
}

// =====================================================================
// ADMIN: PASSWORD RESET REQUESTS
// =====================================================================

function PasswordResetRequests() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery<{ requests: Array<{
    id: string
    username: string
    status: string
    message: string | null
    createdAt: string
    user?: { profile?: { employeeId?: string; position?: string } }
  }>; pendingCount: number }>({
    queryKey: ['password-resets'],
    queryFn: () => apiGet('/api/admin/password-resets?status=pending'),
  })

  interface ResetRequest { id: string; username: string; status: string; message: string | null; createdAt: string; user?: { profile?: { employeeId?: string; position?: string } } }
  const [selectedRequest, setSelectedRequest] = useState<ResetRequest | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const resolveMutation = useMutation({
    mutationFn: ({ id, action, newPassword: pw }: { id: string; action: 'resolve' | 'reject'; newPassword?: string }) =>
      apiPatch(`/api/admin/password-resets/${id}`, { action, newPassword: pw }),
    onSuccess: (_, variables) => {
      toast.success(variables.action === 'resolve' ? 'Password reset successfully!' : 'Request rejected')
      setSelectedRequest(null)
      setNewPassword('')
      queryClient.invalidateQueries({ queryKey: ['password-resets'] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to process request'),
  })

  const requests = data?.requests || []
  const pendingCount = data?.pendingCount || 0

  if (isLoading) {
    return <Skeleton className="h-48 rounded-2xl" />
  }

  return (
    <>
      <div className="product-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              Password Reset Requests
              {pendingCount > 0 && (
                <Badge className="bg-[#c47b32]/10 text-[#c47b32] rounded-full px-2.5 text-xs font-bold">
                  {pendingCount}
                </Badge>
              )}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">Pending password reset requests from employees</p>
          </div>
        </div>

        {requests.length === 0 ? (
          <div className="flex flex-col items-center py-8">
            <CheckCircle2 className="h-10 w-10 text-green-400 mb-2" />
            <p className="text-sm text-gray-500 font-medium">No pending requests</p>
            <p className="text-xs text-gray-400 mt-0.5">All password reset requests have been handled.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[300px]">
            <div className="space-y-2">
              {requests.map((req) => (
                <div key={req.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors border border-gray-100">
                  <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                    <Lock className="h-4 w-4 text-amber-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900">{req.username}</p>
                      {req.user?.profile?.position && (
                        <span className="text-xs text-gray-400">{req.user.profile.position}</span>
                      )}
                    </div>
                    {req.message && (
                      <p className="text-xs text-gray-500 truncate mt-0.5">&ldquo;{req.message}&rdquo;</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {format(parseISO(req.createdAt), 'MMM d, yyyy \'at\' h:mm a')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs rounded-lg border-green-200 text-green-700 hover:bg-green-50 gap-1"
                      onClick={() => resolveMutation.mutate({ id: req.id, action: 'resolve', newPassword: req.username + '123' })}
                      disabled={resolveMutation.isPending}
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      Reset
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 gap-1"
                      onClick={() => resolveMutation.mutate({ id: req.id, action: 'reject' })}
                      disabled={resolveMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Reset Password Dialog */}
      <Dialog open={!!selectedRequest} onOpenChange={(open) => { if (!open) { setSelectedRequest(null); setNewPassword('') } }}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Reset Password for {selectedRequest?.username}</DialogTitle>
            <DialogDescription>Set a new temporary password for this employee.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">New Password</Label>
              <Input
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                type="text"
                className="rounded-lg border-gray-200"
              />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setSelectedRequest(null); setNewPassword('') }} className="flex-1 rounded-lg">
                Cancel
              </Button>
              <Button
                onClick={() => selectedRequest && resolveMutation.mutate({ id: selectedRequest.id, action: 'resolve', newPassword })}
                disabled={!newPassword || newPassword.length < 6 || resolveMutation.isPending}
                className="flex-1 bg-green-600 hover:bg-green-700 text-white rounded-lg"
              >
                {resolveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Set New Password'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

// =====================================================================
// ADMIN: OVERVIEW
// =====================================================================

function AdminOverview() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const { data: stats, isLoading, isError } = useQuery<AdminStats>({
    queryKey: ['admin-stats'],
    queryFn: () => apiGet<AdminStats>('/api/admin/stats'),
  })

  const [addOpen, setAddOpen] = useState(false)
  const [dashAddShowPwd, setDashAddShowPwd] = useState(false)
  const [addForm, setAddForm] = useState({ username: '', password: '', employeeId: '', position: '' })
  const { data: employeesData } = useQuery<EmployeesData>({
    queryKey: ['employees-positions'],
    queryFn: () => apiGet<EmployeesData>('/api/admin/employees'),
  })
  const positions = employeesData?.positions || []

  const addMutation = useMutation({
    mutationFn: (body: typeof addForm) => apiPost('/api/admin/employees', body),
    onSuccess: () => {
      toast.success('Employee added successfully!')
      setAddOpen(false)
      setAddForm({ username: '', password: '', employeeId: '', position: '' })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
      qc.invalidateQueries({ queryKey: ['admin-employees'] })
      qc.invalidateQueries({ queryKey: ['employees-positions'] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to add employee'),
  })

  const pendingReports = stats ? stats.activeEmployees - stats.todayReports : 0
  const complianceScore = stats && stats.activeEmployees > 0
    ? Math.round((stats.todayReports / stats.activeEmployees) * 100)
    : 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <Breadcrumb items={['Workspace', 'Dashboard']} />
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Operational Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live reporting health for your organization</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-9 rounded-lg text-xs gap-1.5 border-gray-200"
            onClick={() => {
              const event = new CustomEvent('admin-navigate', { detail: 'export' })
              window.dispatchEvent(event)
            }}
          >
            <Download className="h-3.5 w-3.5" />
            Export Data
          </Button>
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg text-xs font-medium gap-1.5 h-9 px-4"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Employee
          </Button>
        </div>
      </div>

      {/* Add Employee Dialog - directly on dashboard */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Add New Employee</DialogTitle>
            <DialogDescription>Create a new employee account with their credentials</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Username</Label>
              <Input
                value={addForm.username}
                onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                placeholder="e.g. johndoe"
                className="h-10 rounded-lg border-gray-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Password</Label>
              <div className="relative">
                <Input
                  type={dashAddShowPwd ? 'text' : 'password'}
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  placeholder="Min 6 characters"
                  className="h-10 rounded-lg border-gray-200 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setDashAddShowPwd(!dashAddShowPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {dashAddShowPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Employee ID</Label>
                <Input
                  value={addForm.employeeId}
                  onChange={(e) => setAddForm({ ...addForm, employeeId: e.target.value })}
                  placeholder="EMP-001"
                  className="h-10 rounded-lg border-gray-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Position</Label>
                <Select value={addForm.position} onValueChange={(v) => setAddForm({ ...addForm, position: v })}>
                  <SelectTrigger className="h-10 rounded-lg border-gray-200">
                    <SelectValue placeholder="Select position" />
                  </SelectTrigger>
                  <SelectContent>
                    {positions.map((p) => (
                      <SelectItem key={p} value={p}>{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} className="rounded-lg border-gray-200">Cancel</Button>
            <Button
              onClick={() => addMutation.mutate(addForm)}
              disabled={addMutation.isPending || !addForm.username || !addForm.password || !addForm.employeeId || !addForm.position}
              className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg"
            >
              {addMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Add Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stat Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-2xl" />
          ))}
        </div>
      ) : isError || !stats ? (
        <div className="product-card p-8 flex flex-col items-center text-center">
          <AlertCircle className="h-10 w-10 text-amber-400 mb-3" />
          <p className="text-sm font-medium text-gray-700">Unable to load dashboard statistics</p>
          <p className="text-xs text-gray-400 mt-1">Please check your connection and try again.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 rounded-lg border-gray-200 text-xs"
            onClick={() => qc.invalidateQueries({ queryKey: ['admin-stats'] })}
          >
            Retry
          </Button>
        </div>
      ) : (
        <>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0 }}
          >
            <div className="product-card product-card-hover p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Employees</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalEmployees}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#123c36]/5 flex items-center justify-center">
                  <Users className="h-5 w-5 text-[#123c36]" />
                </div>
              </div>
              <Badge className="mt-3 bg-[#e9f0ee] text-[#356247] border-[#d2ddda] rounded-full px-2 text-[10px] font-medium">
                Active workforce
              </Badge>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="product-card product-card-hover p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Active Employees</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.activeEmployees}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center">
                  <UserCheck className="h-5 w-5 text-green-600" />
                </div>
              </div>
              <div className="mt-3 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-green-500 rounded-full" style={{ width: `${(stats.activeEmployees / Math.max(stats.totalEmployees, 1)) * 100}%` }} />
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div className="product-card product-card-hover p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Reports</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{Math.max(pendingReports, 0)}</p>
                </div>
                <Badge className="bg-[#c47b32]/10 text-[#c47b32] rounded-full px-2.5 text-[10px] font-bold mt-1">
                  URGENT
                </Badge>
              </div>
              <p className="text-xs text-gray-400 mt-3">{stats.todayReports} of {stats.activeEmployees} submitted today</p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
          >
          <div className="product-card-dark product-card-hover p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-white/60">Compliance Score</p>
                <p className="text-3xl font-bold text-white mt-1">{complianceScore}%</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#e9b44c] rounded-full transition-all" style={{ width: `${complianceScore}%` }} />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
        {/* Position Breakdown */}
        <div className="product-card p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">Position Breakdown</h2>
            <p className="text-sm text-gray-500 mt-0.5">Active employees by position</p>
          </div>
          {stats.positionBreakdown?.length > 0 ? (
            <ScrollArea className="max-h-[240px] pr-2">
              <div className="space-y-4">
                {stats.positionBreakdown.map((entry) => {
                  const share = Math.round((entry.count / Math.max(stats.activeEmployees, 1)) * 100)
                  return (
                    <div key={entry.position}>
                      <div className="flex items-center justify-between text-sm mb-1.5 gap-3">
                        <span className="font-medium text-gray-700 truncate">{entry.position}</span>
                        <span className="text-xs text-gray-500 tabular-nums shrink-0">
                          {entry.count} {entry.count === 1 ? 'employee' : 'employees'} · {share}%
                        </span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#123c36] rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(share, 4)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center py-8">
              <Users className="h-10 w-10 text-gray-200 mb-2" />
              <p className="text-sm text-gray-500 font-medium">No employees yet</p>
              <p className="text-xs text-gray-400 mt-0.5">Add employees to see your position mix.</p>
            </div>
          )}
        </div>

        {/* Top Reporters (this month) */}
        <div className="product-card p-6">
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <Trophy className="h-4 w-4 text-[#c47b32]" />
                Top Reporters
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Most submissions in {format(parseISO(stats.currentMonth + '-01'), 'MMMM')}</p>
            </div>
            <Badge className="bg-[#e9f0ee] text-[#356247] border-[#d2ddda] rounded-full px-2.5 text-[10px] font-medium shrink-0">
              {stats.monthReports} this month
            </Badge>
          </div>
          {(stats.topReporters?.length ?? 0) > 0 ? (
            <ScrollArea className="max-h-[240px] pr-2">
              <div className="space-y-3.5">
                {(() => {
                  const reporters = stats.topReporters ?? []
                  const maxCount = Math.max(...reporters.map((r) => r.count), 1)
                  const rankStyles = [
                    'bg-[#c47b32]/15 text-[#9a5d1f] ring-1 ring-[#c47b32]/30',
                    'bg-[#123c36]/10 text-[#356247] ring-1 ring-[#123c36]/20',
                    'bg-amber-50 text-amber-700 ring-1 ring-amber-200/80',
                  ]
                  return reporters.map((reporter, index) => (
                    <div key={`${reporter.username}-${index}`} className="flex items-start gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold tabular-nums shrink-0 mt-0.5 ${rankStyles[index] ?? 'bg-gray-100 text-gray-500 ring-1 ring-gray-200/80'}`}>
                        {index + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <span className="text-sm font-medium text-gray-700 truncate">{reporter.username}</span>
                          <span className="text-xs text-gray-500 tabular-nums shrink-0 font-medium">
                            {reporter.count} {reporter.count === 1 ? 'report' : 'reports'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${Math.max((reporter.count / maxCount) * 100, 6)}%`, background: index === 0 ? '#c47b32' : '#123c36' }}
                            />
                          </div>
                          <span
                            className="text-[10px] text-gray-400 whitespace-nowrap tabular-nums"
                            title={`Last submitted ${format(parseISO(reporter.lastDate), 'EEE, MMM d')}`}
                          >
                            {format(parseISO(reporter.lastDate), 'MMM d')}
                          </span>
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5 truncate">{reporter.position}</p>
                      </div>
                    </div>
                  ))
                })()}
              </div>
            </ScrollArea>
          ) : (
            <div className="flex flex-col items-center py-8">
              <Trophy className="h-10 w-10 text-gray-200 mb-2" />
              <p className="text-sm text-gray-500 font-medium">No submissions this month</p>
              <p className="text-xs text-gray-400 mt-0.5">Rankings appear once reports come in.</p>
            </div>
          )}
        </div>

        {/* Missing Today's Reports */}
        <div className="product-card p-6 lg:col-span-2 xl:col-span-1">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                Missing Today&apos;s Reports
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Employees who haven&apos;t submitted</p>
            </div>
            {stats.missingTodayReports.length > 0 && (
              <Badge className="bg-[#c47b32]/10 text-[#c47b32] rounded-full px-2.5 text-xs font-bold">
                {stats.missingTodayReports.length}
              </Badge>
            )}
          </div>
          {stats.missingTodayReports.length === 0 ? (
            <div className="flex flex-col items-center py-8">
              <CheckCircle2 className="h-10 w-10 text-green-400 mb-2" />
              <p className="text-sm text-gray-500 font-medium">All reports submitted</p>
              <p className="text-xs text-gray-400 mt-0.5">Every active employee has reported today.</p>
            </div>
          ) : (
            <ScrollArea className="max-h-[240px]">
              <div className="space-y-1">
                {stats.missingTodayReports.map((emp) => (
                  <div key={emp.id} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="w-8 h-8 rounded-full bg-[#123c36]/5 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-[#123c36] uppercase">{emp.username.charAt(0)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{emp.username}</p>
                      <p className="text-xs text-gray-400">{emp.profile?.position || 'Unassigned'}</p>
                    </div>
                    <Clock className="h-4 w-4 text-amber-400 shrink-0" />
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Reporting Trend (real 7-day counts from the API) */}
      <div className="product-card p-6">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Reporting Trend</h2>
            <p className="text-sm text-gray-500 mt-0.5">Reports submitted over the last 7 days</p>
          </div>
          <Badge className="bg-[#e9f0ee] text-[#356247] border-[#d2ddda] rounded-full px-2.5 text-[10px] font-medium shrink-0">
            {stats.reportsTrend?.reduce((sum, day) => sum + day.count, 0) ?? 0} in 7 days
          </Badge>
        </div>
        <div className="flex items-end gap-2 sm:gap-3">
          {(stats.reportsTrend ?? []).map((day) => {
            const weekMax = Math.max(...(stats.reportsTrend?.map((d) => d.count) ?? [0]), 1)
            const heightPct = Math.max((day.count / weekMax) * 100, day.count > 0 ? 10 : 3)
            const isToday = day.date === stats.today
            return (
              <div key={day.date} className="flex-1 flex flex-col items-center gap-2 min-w-0">
                <span className="text-xs font-semibold text-gray-700 tabular-nums">{day.count}</span>
                <div className="w-full flex items-end justify-center h-24">
                  <div
                    title={`${day.count} ${day.count === 1 ? 'report' : 'reports'} on ${format(parseISO(day.date), 'EEE, MMM d')}`}
                    className={`w-full max-w-[44px] rounded-t-md transition-all duration-500 hover:opacity-80 ${isToday ? 'bg-[#c47b32]' : 'bg-[#123c36]/85'}`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
                <span className={`text-[10px] sm:text-xs whitespace-nowrap ${isToday ? 'text-[#c47b32] font-bold' : 'text-gray-400'}`}>
                  {format(parseISO(day.date), 'EEE d')}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Recent Reports */}
      <div className="product-card p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">Recent Reports</h2>
          <p className="text-sm text-gray-500 mt-0.5">Last 10 submitted reports</p>
        </div>
        {stats.recentReports.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No reports submitted yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <Table>
              <TableHeader className="product-table-header bg-gray-50/80">
                <TableRow className="border-b border-gray-100 hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Position</TableHead>
                  <TableHead>Activity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentReports.map((r) => (
                  <TableRow key={r.id} className="border-b border-gray-50 last:border-0">
                    <TableCell className="text-sm text-gray-600">{format(parseISO(r.date), 'MMM d')}</TableCell>
                    <TableCell className="text-sm font-medium text-gray-900">{r.user?.username}</TableCell>
                    <TableCell className="text-sm text-gray-500 hidden md:table-cell">{r.user?.profile?.position || '-'}</TableCell>
                    <TableCell className="text-sm text-gray-600 max-w-[280px] truncate">{r.activityText}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      </>)}
      {/* end stats-dependent content */}

      {/* Password Reset Requests */}
      <PasswordResetRequests />
    </motion.div>
  )
}

// =====================================================================
// EMPLOYEE: SUBMIT REPORT
// =====================================================================

function EmployeeSubmitReport() {
  const { t } = useTranslation()
  const today = new Date()
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (typeof window === 'undefined') return today
    try {
      const draft = localStorage.getItem('report-draft')
      if (draft) {
        const parsed = JSON.parse(draft)
        if (parsed.date) return new Date(parsed.date + 'T00:00:00')
      }
    } catch {}
    return today
  })
  const [activityText, setActivityText] = useState(() => {
    if (typeof window === 'undefined') return ''
    try {
      const draft = localStorage.getItem('report-draft')
      if (draft) {
        const parsed = JSON.parse(draft)
        if (parsed.activityText) return parsed.activityText
      }
    } catch {}
    return ''
  })
  const [location, setLocation] = useState('')
  const [timeIn, setTimeIn] = useState('')
  const [timeOut, setTimeOut] = useState('')
  const [comments, setComments] = useState('')
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)

  const handleSaveDraft = () => {
    if (!activityText.trim()) {
      toast.error('Nothing to save — write some activities first')
      return
    }
    localStorage.setItem('report-draft', JSON.stringify({
      activityText: activityText.trim(),
      date: format(selectedDate, 'yyyy-MM-dd'),
      savedAt: new Date().toISOString(),
    }))
    toast.success('Draft saved! It will be restored when you return.')
  }

  const monthStr = format(selectedDate, 'yyyy-MM')

  const { data: reports = [], isLoading } = useQuery<DailyReport[]>({
    queryKey: ['my-reports', monthStr],
    queryFn: () => apiGet<DailyReport[]>(`/api/reports?month=${monthStr}`),
  })

  const existingReport = reports.find((r) => r.date === format(selectedDate, 'yyyy-MM-dd'))
  const hasTodayReport = reports.find((r) => r.date === format(today, 'yyyy-MM-dd'))

  // Lifetime submissions power the "Your reporting month" strip (streak spans months)
  const { data: allReports = [] } = useQuery<DailyReport[]>({
    queryKey: ['my-reports-all'],
    queryFn: () => apiGet<DailyReport[]>('/api/reports'),
  })

  const reportingStats = useMemo(() => {
    const dates = new Set(allReports.map((r) => r.date))
    const monthPrefix = format(today, 'yyyy-MM')
    const monthCount = allReports.filter((r) => r.date.startsWith(monthPrefix)).length
    const lastSubmission = allReports.length > 0
      ? allReports.map((r) => r.date).reduce((a, b) => (a > b ? a : b))
      : null
    // Consecutive-day streak ending today (or yesterday when today is still open)
    const dayKey = (d: Date) => format(d, 'yyyy-MM-dd')
    let cursor: Date | null = null
    if (dates.has(dayKey(today))) {
      cursor = today
    } else {
      const yesterday = new Date(today)
      yesterday.setDate(yesterday.getDate() - 1)
      if (dates.has(dayKey(yesterday))) cursor = yesterday
    }
    let streak = 0
    while (cursor && dates.has(dayKey(cursor))) {
      streak += 1
      cursor = new Date(cursor)
      cursor.setDate(cursor.getDate() - 1)
    }
    return { monthCount, streak, lastSubmission }
  }, [allReports, today])

  const submitMutation = useMutation({
    mutationFn: (body: { date: string; activityText: string; location?: string; timeIn?: string; timeOut?: string; comments?: string }) => apiPost('/api/reports', body),
    onSuccess: () => {
      toast.success('Report submitted successfully!')
      setActivityText('')
      localStorage.removeItem('report-draft')
      setLocation('')
      setTimeIn('')
      setTimeOut('')
      setComments('')
      queryClient.invalidateQueries({ queryKey: ['my-reports', monthStr] })
      queryClient.invalidateQueries({ queryKey: ['my-reports-all'] })
      // Submission auto-reads reminder nudges server-side; refresh the bell.
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message)
      } else {
        toast.error('Failed to submit report')
      }
    },
  })

  const user = useAuthStore((s) => s.user)
  // Server rejects report submission while a temporary password is in place;
  // mirror that here so users see why the form is disabled.
  const passwordBlocked = user?.mustChangePassword === true

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (passwordBlocked) {
      toast.error('Set a new password in Settings before submitting reports')
      return
    }
    if (!activityText.trim()) {
      toast.error('Please describe your activities')
      return
    }
    submitMutation.mutate({
      date: format(selectedDate, 'yyyy-MM-dd'),
      activityText: activityText.trim(),
      location: location.trim() || undefined,
      timeIn: timeIn.trim() || undefined,
      timeOut: timeOut.trim() || undefined,
      comments: comments.trim() || undefined,
    })
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <Breadcrumb items={['Operations', 'Reports', 'Daily Submission']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Daily Activity Report</h1>
        <p className="text-sm text-gray-500 mt-0.5">Record your daily work activities and accomplishments</p>
      </div>

      {/* Alert banner if no today report */}
      {!hasTodayReport && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between gap-4 rounded-xl bg-[#c47b32]/5 border border-[#c47b32]/15 px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#c47b32]/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-[#c47b32]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#c47b32]">You have not submitted today&apos;s report</p>
              <p className="text-xs text-[#c47b32]/60 mt-0.5">Please submit your daily activity report before the deadline.</p>
            </div>
          </div>
          <Button size="sm" className="bg-[#c47b32] hover:bg-[#b2761b] text-white rounded-lg shrink-0" onClick={() => document.getElementById('report-form')?.scrollIntoView({ behavior: 'smooth' })}>
            Submit Now
          </Button>
        </motion.div>
      )}

      {/* Welcome card */}
      <div className="product-card-dark p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-white/50">{format(today, 'EEEE, MMMM d, yyyy')}</p>
            <h2 className="text-lg font-bold text-white mt-1">
              Welcome back, {formatDisplayName(user)}
            </h2>
            <p className="text-sm text-white/60 mt-0.5">
              {user?.profile?.position}
            </p>
          </div>
          <Button
            className="bg-white text-[#123c36] hover:bg-gray-100 rounded-lg font-medium"
            onClick={() => document.getElementById('report-form')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <Send className="mr-2 h-4 w-4" />
            Submit Daily Report
          </Button>
        </div>
      </div>

      {/* Your reporting month */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="product-card product-card-hover p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#123c36]/5 flex items-center justify-center shrink-0">
            <ClipboardCheck className="h-5 w-5 text-[#123c36]" />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-gray-900 tabular-nums leading-none">{reportingStats.monthCount}</p>
            <p className="text-xs text-gray-500 mt-1.5 truncate">Submitted in {format(today, 'MMMM')}</p>
          </div>
        </div>
        <div className="product-card product-card-hover p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#c47b32]/10 flex items-center justify-center shrink-0">
            <Flame className={`h-5 w-5 ${reportingStats.streak > 0 ? 'text-[#c47b32]' : 'text-gray-300'}`} />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-bold text-gray-900 tabular-nums leading-none">{reportingStats.streak}</p>
            <p className="text-xs text-gray-500 mt-1.5 truncate">{reportingStats.streak === 1 ? 'Day' : 'Days'} in a row — keep it up</p>
          </div>
        </div>
        <div className="product-card product-card-hover p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center shrink-0">
            <Clock className="h-5 w-5 text-green-600" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-gray-900 leading-none">
              {reportingStats.lastSubmission ? format(parseISO(reportingStats.lastSubmission), 'MMM d, yyyy') : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-1.5 truncate">Last submission</p>
          </div>
        </div>
      </div>

      {/* Report form */}
      <div id="report-form" className="product-card p-6 max-w-3xl">
        <h3 className="text-base font-semibold text-gray-900 mb-5">Report Details</h3>
        {passwordBlocked && (
          <div className="mb-5 flex flex-col gap-3 rounded-lg border border-amber-300/70 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center" role="alert">
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Reporting is paused until you set a new password</p>
                <p className="text-xs text-amber-800/80">This account still uses a temporary password. Reports can be submitted once you choose a new one.</p>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => window.dispatchEvent(new CustomEvent('admin-navigate', { detail: 'settings' }))}
              className="h-8 shrink-0 rounded-lg bg-[#c47b32] px-3 text-xs font-medium text-white hover:bg-[#a96a2b]"
            >
              <KeyRound className="mr-1.5 h-3.5 w-3.5" />
              Open Settings
            </Button>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Reporting Date</Label>
            <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start gap-2 font-normal h-10 rounded-lg border-gray-200 bg-gray-50/50">
                  <CalendarDays className="h-4 w-4 text-gray-500" />
                  {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={selectedDate}
                  onSelect={(d) => {
                    if (d) {
                      setSelectedDate(d)
                      setIsPopoverOpen(false)
                    }
                  }}
                />
              </PopoverContent>
            </Popover>
          </div>

          {existingReport && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700"
            >
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Report already exists for this date</p>
                <p className="mt-0.5 text-amber-600">Go to &quot;My Reports&quot; to edit your existing report.</p>
              </div>
            </motion.div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="activity" className="text-sm font-medium text-gray-700">
                Detailed Activity Log
              </Label>
              <span className="text-xs text-gray-400">{activityText.length}/2000 characters</span>
            </div>
            <Textarea
              id="activity"
              placeholder="Describe your activities, accomplishments, and any blockers..."
              value={activityText}
              onChange={(e) => setActivityText(e.target.value)}
              rows={6}
              className="resize-none rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
              disabled={!!existingReport}
              maxLength={2000}
            />
            {!existingReport && (
              <VoiceRecorder
                onTranscript={(text) => {
                  // Append to existing text or set if empty
                  setActivityText((prev) => {
                    const trimmed = prev.trim()
                    if (!trimmed) return text
                    return trimmed + ' ' + text
                  })
                }}
              />
            )}
          </div>

          {/* Time In / Time Out row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeIn" className="text-sm font-medium text-gray-700">
                Time In <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="timeIn"
                type="time"
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
                className="h-10 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                disabled={!!existingReport}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timeOut" className="text-sm font-medium text-gray-700">
                Time Out <span className="text-gray-400 font-normal">(optional)</span>
              </Label>
              <Input
                id="timeOut"
                type="time"
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
                className="h-10 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                disabled={!!existingReport}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location" className="text-sm font-medium text-gray-700">
              Location <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Input
              id="location"
              placeholder="e.g. Office, Field - Kampala, Client Site..."
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="h-10 rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
              disabled={!!existingReport}
              maxLength={200}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="comments" className="text-sm font-medium text-gray-700">
              Comments / Notes <span className="text-gray-400 font-normal">(optional)</span>
            </Label>
            <Textarea
              id="comments"
              placeholder="Any additional remarks, challenges faced, or notes for your supervisor..."
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              className="resize-none rounded-lg border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
              disabled={!!existingReport}
              maxLength={1000}
            />
            <p className="text-xs text-gray-400 text-right">{comments.length}/1000 characters</p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <Button
              type="submit"
              disabled={submitMutation.isPending || !!existingReport || passwordBlocked}
              title={passwordBlocked ? 'Set a new password in Settings first' : undefined}
              className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg font-medium"
            >
              {submitMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  Submit Report
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
            <Button type="button" variant="outline" className="rounded-lg border-gray-200" onClick={handleSaveDraft} disabled={!activityText.trim()}>
              Save Draft
            </Button>
          </div>
        </form>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl">
        <div className="rounded-xl bg-[#123c36]/5 border border-[#123c36]/10 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-[#123c36]" />
            <p className="text-xs font-semibold text-[#123c36]">Deadline</p>
          </div>
          <p className="text-xs text-gray-500">Reports should be submitted by {formatDeadlineLabel(user?.reportDeadline)} daily</p>
        </div>
        <div className="rounded-xl bg-green-50/50 border border-green-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck className="h-4 w-4 text-green-700" />
            <p className="text-xs font-semibold text-green-700">Compliance</p>
          </div>
          <p className="text-xs text-gray-500">Consistent reporting is tracked for performance review</p>
        </div>
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="h-4 w-4 text-gray-600" />
            <p className="text-xs font-semibold text-gray-600">Privacy</p>
          </div>
          <p className="text-xs text-gray-500">Reports are confidential and accessible only to authorized personnel</p>
        </div>
      </div>
    </motion.div>
  )
}

// =====================================================================
// EMPLOYEE: MY REPORTS
// =====================================================================

function EmployeeMyReports({ initialSearch }: { initialSearch?: string }) {
  const { t } = useTranslation()
  const [currentMonth, setCurrentMonth] = useState(new Date())
  const [search, setSearch] = useState(initialSearch || '')
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null)
  const [editText, setEditText] = useState('')
  const [editLocation, setEditLocation] = useState('')
  const [editTimeIn, setEditTimeIn] = useState('')
  const [editTimeOut, setEditTimeOut] = useState('')
  const [editComments, setEditComments] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<DailyReport | null>(null)
  const qc = useQueryClient()

  const monthStr = format(currentMonth, 'yyyy-MM')

  const { data: reports = [], isLoading } = useQuery<DailyReport[]>({
    queryKey: ['my-reports', monthStr],
    queryFn: () => apiGet<DailyReport[]>(`/api/reports?month=${monthStr}`),
  })

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return reports
    return reports.filter((report) =>
      [report.activityText, report.location, report.comments]
        .some((field) => (field ?? '').toLowerCase().includes(q))
    )
  }, [reports, search])

  const updateMutation = useMutation({
    mutationFn: ({ id, activityText, location, timeIn, timeOut, comments }: { id: string; activityText: string; location?: string; timeIn?: string; timeOut?: string; comments?: string }) =>
      apiPut(`/api/reports/${id}`, { activityText, location, timeIn, timeOut, comments }),
    onSuccess: () => {
      toast.success('Report updated!')
      setEditingReport(null)
      qc.invalidateQueries({ queryKey: ['my-reports', monthStr] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to update')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/reports/${id}`),
    onSuccess: () => {
      toast.success('Report deleted!')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['my-reports', monthStr] })
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to delete')
    },
  })

  const prevMonth = () => setCurrentMonth(subMonths(currentMonth, 1))
  const nextMonth = () => setCurrentMonth(addMonths(currentMonth, 1))

  const openEdit = (report: DailyReport) => {
    setEditingReport(report)
    setEditText(report.activityText)
    setEditLocation(report.location || '')
    setEditTimeIn(report.timeIn || '')
    setEditTimeOut(report.timeOut || '')
    setEditComments(report.comments || '')
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <Breadcrumb items={['Operations', 'My Reports']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Recent Submissions</h1>
        <p className="text-sm text-gray-500 mt-0.5">View and manage your daily reports</p>
      </div>

      {/* Month navigation + search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="icon" onClick={prevMonth} className="rounded-lg border-gray-200 h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-semibold min-w-[160px] text-center">
            {format(currentMonth, 'MMMM yyyy')}
          </span>
          <Button variant="outline" size="icon" onClick={nextMonth} className="rounded-lg border-gray-200 h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search this month's reports..."
            aria-label="Search my reports"
            className="h-9 pl-9 pr-8 rounded-lg border-gray-200 bg-gray-50/50 text-sm focus:bg-white"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : filteredReports.length === 0 ? (
        search.trim() ? (
          <div className="product-card border-dashed flex flex-col items-center justify-center py-16">
            <Search className="h-12 w-12 text-gray-200 mb-3" />
            <p className="text-gray-500 font-medium">No reports match “{search.trim()}”</p>
            <p className="text-gray-400 text-sm mt-1">Try a different keyword or clear the search</p>
            <Button variant="outline" size="sm" className="mt-4 rounded-lg border-gray-200 text-xs" onClick={() => setSearch('')}>
              Clear search
            </Button>
          </div>
        ) : (
          <div className="product-card border-dashed flex flex-col items-center justify-center py-16">
            <FileText className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No reports for this month</p>
            <p className="text-gray-400 text-sm mt-1">Submit your first report for the selected month</p>
          </div>
        )
      ) : (
        <div className="product-card overflow-hidden">
          <Table>
            <TableHeader className="product-table-header bg-gray-50/80">
              <TableRow className="border-b border-gray-100 hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Report Subject</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReports.map((report) => (
                <TableRow key={report.id} className="border-b border-gray-50 last:border-0">
                  <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                    {format(parseISO(report.date), 'MMM d, yyyy')}
                  </TableCell>
                  <TableCell className="text-sm text-gray-700 max-w-[400px]">
                    <p className="truncate font-medium">{report.activityText.substring(0, 60)}{report.activityText.length > 60 ? '...' : ''}</p>
                    <div className="flex flex-wrap items-center gap-2 mt-0.5">
                      {(report.timeIn || report.timeOut) && (
                        <p className="text-xs text-gray-400">🕐 {report.timeIn || '--'} – {report.timeOut || '--'}</p>
                      )}
                      {report.location && (
                        <p className="text-xs text-gray-400 truncate">📍 {report.location}</p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge className="bg-green-50 text-green-700 border-green-200 rounded-full px-2.5 text-xs font-medium">
                      Submitted
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(report)}>
                        <Pencil className="h-3.5 w-3.5 text-gray-500" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(report)}>
                        <Trash2 className="h-3.5 w-3.5 text-gray-500 hover:text-[#c47b32]" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <button className="text-sm font-medium text-[#123c36] hover:text-[#1d5249] transition-colors">
        View Full Report History
      </button>

      {/* Edit Dialog */}
      <Dialog open={!!editingReport} onOpenChange={() => setEditingReport(null)}>
        <DialogContent className="rounded-2xl sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Report</DialogTitle>
            <DialogDescription>
              Editing report for {editingReport ? format(parseISO(editingReport.date), 'EEEE, MMMM d, yyyy') : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Activity</Label>
              <Textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={5}
                className="resize-none rounded-lg border-gray-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Time In</Label>
                <Input
                  type="time"
                  value={editTimeIn}
                  onChange={(e) => setEditTimeIn(e.target.value)}
                  className="h-10 rounded-lg border-gray-200"
                />
              </div>
              <div className="space-y-2">
                <Label>Time Out</Label>
                <Input
                  type="time"
                  value={editTimeOut}
                  onChange={(e) => setEditTimeOut(e.target.value)}
                  className="h-10 rounded-lg border-gray-200"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                placeholder="e.g. Office, Field - Kampala..."
                className="h-10 rounded-lg border-gray-200"
                maxLength={200}
              />
            </div>
            <div className="space-y-2">
              <Label>Comments / Notes</Label>
              <Textarea
                value={editComments}
                onChange={(e) => setEditComments(e.target.value)}
                rows={3}
                placeholder="Additional remarks..."
                className="resize-none rounded-lg border-gray-200"
                maxLength={1000}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingReport(null)} className="rounded-lg border-gray-200">Cancel</Button>
            <Button
              onClick={() => editingReport && updateMutation.mutate({
                id: editingReport.id,
                activityText: editText,
                location: editLocation.trim() || undefined,
                timeIn: editTimeIn.trim() || undefined,
                timeOut: editTimeOut.trim() || undefined,
                comments: editComments.trim() || undefined,
              })}
              disabled={updateMutation.isPending || !editText.trim()}
              className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg"
            >
              {updateMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete the report for{' '}
              {deleteTarget ? format(parseISO(deleteTarget.date), 'MMMM d, yyyy') : ''}? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-[#c47b32] hover:bg-[#b2761b] text-white rounded-lg"
            >
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

// =====================================================================
// ADMIN: EMPLOYEES
// =====================================================================

function AdminEmployees({ initialSearch }: { initialSearch?: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [search, setSearch] = useState(initialSearch || '')
  const [statusFilter, setStatusFilter] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [empAddShowPwd, setEmpAddShowPwd] = useState(false)
  const [editTarget, setEditTarget] = useState<Employee | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [editShowPwd, setEditShowPwd] = useState(false)
  const [exporting, setExporting] = useState(false)

  const [addForm, setAddForm] = useState({ username: '', password: '', employeeId: '', position: '' })
  const [editForm, setEditForm] = useState({ username: '', status: '', position: '', employeeId: '', password: '' })

  // Sync search with initialSearch prop changes
  useEffect(() => {
    if (initialSearch !== undefined) {
      setSearch(initialSearch)
    }
  }, [initialSearch])

  const { data, isLoading } = useQuery<EmployeesData>({
    queryKey: ['admin-employees', search, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams()
      if (search) params.set('search', search)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      return apiGet<EmployeesData>(`/api/admin/employees?${params.toString()}`)
    },
  })

  const addMutation = useMutation({
    mutationFn: (body: typeof addForm) => apiPost('/api/admin/employees', body),
    onSuccess: () => {
      toast.success('Employee added successfully!')
      setAddOpen(false)
      setAddForm({ username: '', password: '', employeeId: '', position: '' })
      qc.invalidateQueries({ queryKey: ['admin-employees'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to add employee'),
  })

  const editMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof editForm }) => apiPatch(`/api/admin/employees/${id}`, body),
    onSuccess: () => {
      toast.success('Employee updated!')
      setEditTarget(null)
      qc.invalidateQueries({ queryKey: ['admin-employees'] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to update'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiDelete(`/api/admin/employees/${id}`),
    onSuccess: () => {
      toast.success('Employee deleted!')
      setDeleteTarget(null)
      qc.invalidateQueries({ queryKey: ['admin-employees'] })
      qc.invalidateQueries({ queryKey: ['admin-stats'] })
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : 'Failed to delete'),
  })

  const openEdit = (emp: Employee) => {
    setEditTarget(emp)
    setEditForm({
      username: emp.username,
      status: emp.status,
      position: emp.profile?.position || '',
      employeeId: emp.profile?.employeeId || '',
      password: ''
    })
  }

  const employees = data?.employees || []
  const positions = data?.positions || []

  const activeCount = employees.filter(e => e.status === 'active').length
  const suspendedCount = employees.filter(e => e.status === 'suspended').length
  const archivedCount = employees.filter(e => e.status === 'archived').length

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <Breadcrumb items={['Workspace', 'Workforce Management']} />
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Employee Management</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage employee accounts and access</p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            className="h-9 rounded-lg text-xs gap-1.5 border-gray-200"
            disabled={exporting}
            onClick={async () => {
              setExporting(true)
              try {
                const data = await apiGet<EmployeesData>('/api/admin/employees')
                const emps = data.employees || []
                const csvRows = ['Employee ID,Username,Position,Status,Reports']
                for (const e of emps) {
                  csvRows.push(`"${e.profile?.employeeId || ''}","${e.username}","${e.profile?.position || ''}","${e.status}","${e._count?.reports || 0}"`)
                }
                const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'employees-export.csv'
                document.body.appendChild(a)
                a.click()
                document.body.removeChild(a)
                URL.revokeObjectURL(url)
                toast.success('Employee list exported!')
              } catch (err) {
                toast.error(err instanceof ApiError ? err.message : 'Failed to export employees')
              } finally {
                setExporting(false)
              }
            }}
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
            Export CSV
          </Button>
          <Button
            onClick={() => setAddOpen(true)}
            className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg text-xs font-medium gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Employee
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="product-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Total Employees</p>
            <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{employees.length}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-[#123c36]/5 flex items-center justify-center shrink-0">
            <Users className="h-4.5 w-4.5 text-[#123c36]" />
          </div>
        </div>
        <div className="product-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Active Roles</p>
            <p className="text-xl font-bold text-green-600 mt-1 tabular-nums">{activeCount}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
            <UserCheck className="h-4.5 w-4.5 text-green-600" />
          </div>
        </div>
        <div className="product-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Suspended</p>
            <p className="text-xl font-bold text-amber-600 mt-1 tabular-nums">{suspendedCount}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
            <AlertCircle className="h-4.5 w-4.5 text-amber-600" />
          </div>
        </div>
        <div className="product-card p-4 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Archived</p>
            <p className="text-xl font-bold text-gray-400 mt-1 tabular-nums">{archivedCount}</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
            <Archive className="h-4.5 w-4.5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="product-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name, ID, or position..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 h-9 rounded-lg border-gray-200 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-[140px] h-9 rounded-lg text-sm border-gray-200">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="suspended">Suspended</SelectItem>
              <SelectItem value="archived">Archived</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="product-card p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="product-card border-dashed flex flex-col items-center py-16">
          <Users className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No employees found</p>
          <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or add a new employee</p>
        </div>
      ) : (
        <div className="product-card overflow-hidden">
          <ScrollArea className="h-[60vh] min-h-[300px]">
            <Table>
              <TableHeader className="product-table-header bg-gray-50/80">
                <TableRow className="border-b border-gray-100 hover:bg-transparent">
                  <TableHead>Employee ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead className="hidden md:table-cell">Position</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Reports</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {employees.map((emp) => (
                  <TableRow key={emp.id} className="border-b border-gray-50 last:border-0">
                    <TableCell className="text-sm text-gray-500 font-mono text-xs">
                      {emp.profile?.employeeId || '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[#123c36]/5 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-[#123c36] uppercase">{emp.username.charAt(0)}</span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{emp.username}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500 hidden md:table-cell">
                      {emp.profile?.position || '-'}
                    </TableCell>
                    <TableCell><StatusBadge status={emp.status} /></TableCell>
                    <TableCell className="text-sm text-gray-600 text-center">{emp._count?.reports || 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(emp)}>
                          <Pencil className="h-3.5 w-3.5 text-gray-500" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteTarget(emp)}>
                          <Trash2 className="h-3.5 w-3.5 text-gray-500 hover:text-[#c47b32]" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        </div>
      )}

      {/* Add Employee Dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Create Employee</DialogTitle>
            <DialogDescription>Add a new employee to the system</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">Username</Label>
              <Input
                value={addForm.username}
                onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                placeholder="johndoe"
                className="rounded-lg border-gray-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Password</Label>
              <div className="relative">
                <Input
                  type={empAddShowPwd ? 'text' : 'password'}
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                  placeholder="Enter password"
                  className="rounded-lg border-gray-200 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setEmpAddShowPwd(!empAddShowPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {empAddShowPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Employee ID</Label>
              <Input
                value={addForm.employeeId}
                onChange={(e) => setAddForm({ ...addForm, employeeId: e.target.value })}
                placeholder="EMP-001"
                className="rounded-lg border-gray-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">Position</Label>
              <Select value={addForm.position} onValueChange={(v) => setAddForm({ ...addForm, position: v })}>
                <SelectTrigger className="w-full rounded-lg border-gray-200">
                  <SelectValue placeholder="Select position" />
                </SelectTrigger>
                <SelectContent>
                  {positions.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} className="rounded-lg border-gray-200">Cancel</Button>
            <Button
              onClick={() => addMutation.mutate(addForm)}
              disabled={addMutation.isPending || !addForm.username || !addForm.password || !addForm.employeeId || !addForm.position}
              className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg"
            >
              {addMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Create Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Employee Dialog */}
      <Dialog open={!!editTarget} onOpenChange={() => setEditTarget(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>Edit Employee</DialogTitle>
            <DialogDescription>Update {editTarget?.username}&apos;s information</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Username</Label>
              <Input
                value={editForm.username}
                onChange={(e) => setEditForm({ ...editForm, username: e.target.value })}
                placeholder="Username"
                className="rounded-lg border-gray-200"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Employee ID</Label>
                <Input
                  value={editForm.employeeId}
                  onChange={(e) => setEditForm({ ...editForm, employeeId: e.target.value })}
                  placeholder="EMP-001"
                  className="rounded-lg border-gray-200"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium text-gray-700">Status</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger className="w-full rounded-lg border-gray-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Position</Label>
              <Select value={editForm.position} onValueChange={(v) => setEditForm({ ...editForm, position: v })}>
                <SelectTrigger className="w-full rounded-lg border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {positions.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Reset Password <span className="text-gray-400 font-normal">(leave blank to keep current)</span></Label>
              <div className="relative">
                <Input
                  type={editShowPwd ? 'text' : 'password'}
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="New password"
                  className="rounded-lg border-gray-200 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setEditShowPwd(!editShowPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  {editShowPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)} className="rounded-lg border-gray-200">Cancel</Button>
            <Button
              onClick={() => editTarget && editMutation.mutate({ id: editTarget.id, body: editForm })}
              disabled={editMutation.isPending}
              className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg"
            >
              {editMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pencil className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete <strong>{deleteTarget?.username}</strong>? This will also remove all their reports. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
              className="bg-[#c47b32] hover:bg-[#b2761b] text-white rounded-lg"
            >
              {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  )
}

// =====================================================================
// ADMIN: REPORTS
// =====================================================================

function AdminReports() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [date, setDate] = useState('')
  const [userId, setUserId] = useState('all')
  const [page, setPage] = useState(1)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const { data: empData } = useQuery<EmployeesData>({
    queryKey: ['admin-employees-list'],
    queryFn: () => apiGet<EmployeesData>('/api/admin/employees'),
  })

  const params = useMemo(() => {
    const p = new URLSearchParams()
    p.set('page', String(page))
    p.set('limit', '50')
    if (month) p.set('month', month)
    if (date) p.set('date', date)
    if (userId !== 'all') p.set('userId', userId)
    return p.toString()
  }, [month, date, userId, page])

  const { data, isLoading } = useQuery<DailyPaginatedReports>({
    queryKey: ['admin-reports', params],
    queryFn: () => apiGet<DailyPaginatedReports>(`/api/admin/reports?${params}`),
  })

  const reports = data?.reports || []
  const pagination = data?.pagination

  const monthDate = month ? parseISO(month + '-01') : new Date()
  const prevMonth = () => {
    const m = subMonths(monthDate, 1)
    setMonth(format(m, 'yyyy-MM'))
    setPage(1)
  }
  const nextMonth = () => {
    const m = addMonths(monthDate, 1)
    setMonth(format(m, 'yyyy-MM'))
    setPage(1)
  }

  const employees = empData?.employees || []

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <Breadcrumb items={['Workspace', 'Reports']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">All Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">View and filter all employee reports</p>
      </div>

      {/* Filters */}
      <div className="product-card p-4">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Month nav */}
          <div className="flex items-center gap-2 border rounded-lg px-3 py-1.5 bg-white border-gray-200">
            <button onClick={prevMonth} className="p-0.5 hover:bg-gray-100 rounded">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium min-w-[120px] text-center">{format(monthDate, 'MMMM yyyy')}</span>
            <button onClick={nextMonth} className="p-0.5 hover:bg-gray-100 rounded">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Date filter */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto justify-start gap-2 font-normal h-9 rounded-lg border-gray-200 text-sm">
                <CalendarDays className="h-4 w-4 text-gray-400" />
                {date ? format(parseISO(date), 'MMM d, yyyy') : 'Specific date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <CalendarComponent
                mode="single"
                selected={date ? parseISO(date) : undefined}
                onSelect={(d) => {
                  if (d) {
                    setDate(format(d, 'yyyy-MM-dd'))
                    setPage(1)
                  }
                }}
              />
              {date && (
                <div className="border-t px-3 py-2">
                  <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => { setDate(''); setPage(1) }}>
                    Clear date filter
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>

          <Select value={userId} onValueChange={(v) => { setUserId(v); setPage(1) }}>
            <SelectTrigger className="w-full sm:w-[170px] h-9 rounded-lg text-sm border-gray-200">
              <SelectValue placeholder="All employees" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Employees</SelectItem>
              {employees.map((e) => (
                <SelectItem key={e.id} value={e.id}>{e.username}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="product-card p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="product-card border-dashed flex flex-col items-center py-16">
          <FileText className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No reports found</p>
          <p className="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="product-card overflow-hidden">
          <ScrollArea className="h-[60vh] min-h-[300px]">
            <Table>
              <TableHeader className="product-table-header bg-gray-50/80">
                <TableRow className="border-b border-gray-100 hover:bg-transparent">
                  <TableHead>Date</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead className="hidden md:table-cell">Position</TableHead>
                  <TableHead>Activity</TableHead>
                  <TableHead className="w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((r) => (
                  <TableRow key={r.id} className="border-b border-gray-50 last:border-0 group">
                    <TableCell className="text-sm text-gray-600 whitespace-nowrap">
                      {format(parseISO(r.date), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-sm font-medium text-gray-900">{r.user?.username || '-'}</TableCell>
                    <TableCell className="text-sm text-gray-500 hidden md:table-cell">
                      {r.user?.profile?.position || '-'}
                    </TableCell>
                    <TableCell className="text-sm text-gray-600 max-w-[300px]">
                      {expandedId === r.id ? (
                        <div className="space-y-1.5">
                          <p className="whitespace-pre-wrap leading-relaxed">{r.activityText}</p>
                          <div className="flex flex-wrap items-center gap-2">
                            {(r.timeIn || r.timeOut) && (
                              <p className="text-xs text-gray-400 flex items-center gap-1">🕐 {r.timeIn || '--'} – {r.timeOut || '--'}</p>
                            )}
                            {r.location && (
                              <p className="text-xs text-gray-400 flex items-center gap-1">📍 {r.location}</p>
                            )}
                          </div>
                          {r.comments && (
                            <p className="text-xs text-gray-500 italic mt-1">💬 {r.comments}</p>
                          )}
                        </div>
                      ) : (
                        <p className="truncate">{r.activityText}</p>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                      >
                        {expandedId === r.id ? <ChevronUp className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-500">
                Page {pagination.page} of {pagination.totalPages} ({pagination.total} reports)
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={pagination.page <= 1} onClick={() => setPage(pagination.page - 1)} className="rounded-lg border-gray-200 h-8">
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button variant="outline" size="sm" disabled={pagination.page >= pagination.totalPages} onClick={() => setPage(pagination.page + 1)} className="rounded-lg border-gray-200 h-8">
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

// =====================================================================
// ADMIN: EXPORT
// =====================================================================

function AdminExport() {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [exporting, setExporting] = useState(false)

  const monthDate = parseISO(month + '-01')

  const handleExport = async () => {
    setExporting(true)
    try {
      const token = useAuthStore.getState().token
      const response = await fetch(`/api/admin/export?month=${month}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Export failed' }))
        toast.error(data.error || 'Export failed')
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `daily-reports-${month}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Export downloaded successfully!')
    } catch {
      toast.error('Failed to export reports')
    } finally {
      setExporting(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <Breadcrumb items={['Workspace', 'Export']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Export Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Download monthly reports as Excel file</p>
      </div>

      <div className="product-card p-6 max-w-lg">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Select Month</Label>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => setMonth(format(subMonths(monthDate, 1), 'yyyy-MM'))} className="rounded-lg border-gray-200 h-9 w-9">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold min-w-[160px] text-center">{format(monthDate, 'MMMM yyyy')}</span>
              <Button variant="outline" size="icon" onClick={() => setMonth(format(addMonths(monthDate, 1), 'yyyy-MM'))} className="rounded-lg border-gray-200 h-9 w-9">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="rounded-xl bg-[#123c36]/3 border border-[#123c36]/10 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#123c36]" />
              <p className="text-sm font-semibold text-[#123c36]">Export Summary</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              This will download an Excel file containing all daily reports for <strong>{format(monthDate, 'MMMM yyyy')}</strong>.
              The file includes a <strong>Daily Reports</strong> sheet with full details (Activity, Location, Time In/Out, Comments) and an <strong>Employee Summary</strong> sheet.
            </p>
          </div>

          <Button
            onClick={handleExport}
            disabled={exporting}
            className="w-full bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg font-medium h-11"
          >
            {exporting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Excel
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  )
}

// =====================================================================
// EMPLOYEE: MONTHLY REPORTS
// =====================================================================

function EmployeeMonthlyReports() {
  const qc = useQueryClient()
  const user = useAuthStore((s) => s.user)
  const [genMonth, setGenMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [viewingReport, setViewingReport] = useState<any>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [regenerateConfirm, setRegenerateConfirm] = useState<string | null>(null)

  const genMonthDate = parseISO(genMonth + '-01')

  // Fetch list of generated reports
  const { data: reports = [], isLoading } = useQuery<MonthlyReportListItem[]>({
    queryKey: ['monthly-reports'],
    queryFn: () => apiGet<MonthlyReportListItem[]>('/api/reports/monthly'),
  })

  const generateMutation = useMutation({
    mutationFn: () => apiPost('/api/reports/monthly', { month: genMonth }),
    onSuccess: (data) => {
      toast.success('Monthly report generated successfully!')
      qc.invalidateQueries({ queryKey: ['monthly-reports'] })
      setViewingReport(data)
      setViewOpen(true)
      setGenerating(false)
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 409) {
        setRegenerateConfirm(genMonth)
        setGenerating(false)
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Failed to generate report')
        setGenerating(false)
      }
    },
  })

  const regenerateMutation = useMutation({
    mutationFn: (month: string) => apiPost('/api/reports/monthly', { month, force: true }),
    onSuccess: (data) => {
      toast.success('Report regenerated successfully!')
      qc.invalidateQueries({ queryKey: ['monthly-reports'] })
      setViewingReport(data)
      setViewOpen(true)
      setRegenerateConfirm(null)
      setGenerating(false)
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : 'Failed to regenerate report')
      setRegenerateConfirm(null)
      setGenerating(false)
    },
  })

  const handleGenerate = () => {
    setGenerating(true)
    generateMutation.mutate()
  }

  const handleViewReport = async (reportId: string) => {
    try {
      const data = await apiGet(`/api/reports/monthly/${reportId}`)
      setViewingReport(data)
      setViewOpen(true)
    } catch {
      toast.error('Failed to load report')
    }
  }

  const handleExport = async (reportId: string) => {
    try {
      const token = useAuthStore.getState().token
      const response = await fetch(`/api/reports/monthly/export/${reportId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!response.ok) {
        toast.error('Export failed')
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const contentDisposition = response.headers.get('content-disposition')
      const filenameMatch = contentDisposition?.match(/filename="([^"]+)"/)
      a.download = filenameMatch?.[1] || 'monthly-report.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Report exported successfully!')
    } catch {
      toast.error('Export failed')
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <Breadcrumb items={['Operations', 'Monthly Reports']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Monthly Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Generate and export professional monthly activity reports</p>
      </div>

      {/* Generate New Report */}
      <div className="product-card p-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="h-5 w-5 text-[#123c36]" />
          <h2 className="text-base font-semibold text-gray-900">Generate New Report</h2>
        </div>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-700">Select Month</Label>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="icon" onClick={() => setGenMonth(format(subMonths(genMonthDate, 1), 'yyyy-MM'))} className="rounded-lg border-gray-200 h-9 w-9">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold min-w-[160px] text-center">{format(genMonthDate, 'MMMM yyyy')}</span>
              <Button variant="outline" size="icon" onClick={() => setGenMonth(format(addMonths(genMonthDate, 1), 'yyyy-MM'))} className="rounded-lg border-gray-200 h-9 w-9">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="rounded-xl bg-[#123c36]/5 border border-[#123c36]/10 p-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              This will analyze all your daily reports for <strong>{format(genMonthDate, 'MMMM yyyy')}</strong>,
              categorize activities, calculate statistics, and produce a professional monthly report.
              The report will be saved and can be exported to Excel.
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg font-medium"
          >
            {generating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Report...
              </>
            ) : (
              <>
                <BarChart3 className="mr-2 h-4 w-4" />
                Generate Monthly Report
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Existing Reports */}
      <div className="product-card p-6">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Generated Reports</h2>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full rounded-lg" />
            <Skeleton className="h-16 w-full rounded-lg" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <BarChart3 className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No monthly reports yet</p>
            <p className="text-gray-400 text-sm mt-1">Generate your first monthly report above</p>
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((report: any) => {
              const reportMonthDate = parseISO(report.month + '-01')
              return (
                <div key={report.id} className="flex items-center justify-between gap-4 p-4 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-[#123c36]/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-[#123c36]" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{format(reportMonthDate, 'MMMM yyyy')}</p>
                      <p className="text-xs text-gray-400">{report.totalReports} reports &middot; {report.totalActivities} activities &middot; {report.submissionRate}% rate</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1.5 border-gray-200" onClick={() => handleViewReport(report.id)}>
                      <Eye className="h-3.5 w-3.5" />
                      View
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1.5 border-gray-200" onClick={() => handleExport(report.id)}>
                      <Download className="h-3.5 w-3.5" />
                      Export
                    </Button>
                    <Button variant="ghost" size="sm" className="rounded-lg text-xs gap-1.5 text-gray-500 hover:text-[#123c36]" onClick={() => setRegenerateConfirm(report.month)} title="Regenerate this report">
                      <RefreshCw className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Regeneration Confirmation Dialog */}
      <AlertDialog open={!!regenerateConfirm} onOpenChange={(open) => !open && setRegenerateConfirm(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Monthly Report</AlertDialogTitle>
            <AlertDialogDescription>
              A report for {regenerateConfirm ? format(parseISO(regenerateConfirm + '-01'), 'MMMM yyyy') : 'this month'} already exists. Do you want to regenerate it? This will replace the current report with a new version based on your latest daily reports.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (regenerateConfirm) regenerateMutation.mutate(regenerateConfirm) }} className="bg-[#123c36] hover:bg-[#1d5249]">
              {regenerateMutation.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Regenerating...</> : 'Regenerate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ReportViewerDialog report={viewingReport} open={viewOpen} onOpenChange={setViewOpen} onExport={(id) => id && handleExport(id)} />
    </motion.div>
  )
}

// =====================================================================
// SHARED: REPORT VIEWER DIALOG
// =====================================================================

function ReportViewerDialog({ report, open, onOpenChange, onExport }: {
  report: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onExport: (id: string) => void
}) {
  if (!report) return null

  const stats = report.statistics || {}

  // Safe helpers to prevent undefined crashes
  const safeStat = (val: unknown, fallback = '—') => (val !== undefined && val !== null ? String(val) : fallback)
  const safeNum = (val: unknown, fallback = 0) => (typeof val === 'number' ? val : fallback)
  const safeArr = (val: unknown): unknown[] => (Array.isArray(val) ? val : [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#123c36]" />
            Monthly Report — {report.employeeInfo?.reportingMonthLabel || 'N/A'}
          </DialogTitle>
          <DialogDescription>
            {report.employeeInfo?.name || 'Unknown'} ({report.employeeInfo?.employeeId || 'N/A'})
            {report.createdAt ? ` · Generated ${format(parseISO(String(report.createdAt)), 'MMM d, yyyy')}` : ''}
          </DialogDescription>
        </DialogHeader>

        {/* Regeneration info banner */}
        {report.isRegeneration && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-700">
            <RefreshCw className="h-4 w-4 shrink-0" />
            <span>This is a regenerated report. The original was created on {report.originalCreatedAt ? format(parseISO(String(report.originalCreatedAt)), 'MMM d, yyyy') : 'an earlier date'}.</span>
          </div>
        )}

        <div className="space-y-6 pb-4">
          {/* Employee Info Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Employee', value: report.employeeInfo?.name },
              { label: 'ID', value: report.employeeInfo?.employeeId },
              { label: 'Position', value: report.employeeInfo?.position },
              { label: 'Period', value: report.employeeInfo?.reportingMonthLabel },
            ].map((item) => (
              <div key={item.label} className="p-3 rounded-lg bg-gray-50">
                <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">{item.label}</p>
                <p className="text-sm font-medium text-gray-900 mt-0.5 truncate">{item.value || '—'}</p>
              </div>
            ))}
          </div>

          {/* Submission Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-[#123c36]/5 border border-[#123c36]/10">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Submission Rate</p>
              <p className="text-xl font-bold text-[#123c36]">{safeNum(stats.submissionRate)}%</p>
              <p className="text-[10px] text-gray-400">{safeNum(stats.totalReportsSubmitted)}/{safeNum(stats.expectedReports)} days</p>
            </div>
            <div className="p-3 rounded-lg bg-green-50 border border-green-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Activities</p>
              <p className="text-xl font-bold text-green-700">{safeNum(stats.totalActivities)}</p>
              <p className="text-[10px] text-gray-400">{safeNum(stats.avgActivitiesPerDay)}/day avg</p>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Streak</p>
              <p className="text-xl font-bold text-amber-700">{safeNum(stats.longestStreak)}</p>
              <p className="text-[10px] text-gray-400">longest consecutive</p>
            </div>
            <div className="p-3 rounded-lg bg-purple-50 border border-purple-100">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Categories</p>
              <p className="text-xl font-bold text-purple-700">{safeNum(stats.categoriesWorked)}</p>
              <p className="text-[10px] text-gray-400">work areas covered</p>
            </div>
          </div>

          {/* Extra Stats Row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="p-2 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-400">Most Active Day</p>
              <p className="text-sm font-semibold text-gray-700">{safeStat(stats.mostActiveDay)}</p>
            </div>
            <div className="p-2 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-400">Most Active Week</p>
              <p className="text-sm font-semibold text-gray-700">{safeStat(stats.mostActiveWeek)}</p>
            </div>
            <div className="p-2 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-400">Missed Days</p>
              <p className="text-sm font-semibold text-gray-700">{safeNum(stats.missedSubmissions)}</p>
            </div>
            <div className="p-2 rounded-lg border border-gray-100">
              <p className="text-xs text-gray-400">Words Written</p>
              <p className="text-sm font-semibold text-gray-700">{safeNum(stats.totalWords)}</p>
            </div>
          </div>

          {/* Executive Summary */}
          {report.summary && (
          <div className="p-4 rounded-xl bg-[#123c36]/5 border border-[#123c36]/10">
            <h3 className="text-sm font-semibold text-[#123c36] mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Executive Summary
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">{report.summary}</p>
            {report.dominantFocus && (
              <p className="text-xs text-[#123c36] mt-2 font-medium">Dominant Focus: {report.dominantFocus}</p>
            )}
          </div>
          )}

          {/* Key Work Areas */}
          {safeArr(report.keyWorkAreas).length > 0 && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Key Work Areas</h3>
              <ol className="space-y-1.5">
                {safeArr(report.keyWorkAreas).map((area: unknown, i: number) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-[#123c36] font-bold">{i + 1}.</span>
                    {String(area)}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Category Breakdown */}
          {safeArr(report.categoryBreakdown).length > 0 && (
            <div className="p-4 rounded-xl bg-[#123c36]/5 border border-[#123c36]/10">
              <h3 className="text-sm font-semibold text-[#123c36] mb-3">Activity Breakdown</h3>
              <div className="space-y-2.5">
                {safeArr(report.categoryBreakdown).map((cat: unknown, i: number) => {
                  const c = cat as Record<string, unknown>
                  return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{String(c.category || 'Unknown')}</span>
                      <span className="text-xs text-gray-400">{String(c.count ?? 0)} activities ({String(c.percentage ?? 0)}%)</span>
                    </div>
                    <div className="w-full bg-[#123c36]/15 rounded-full h-2">
                      <div className="h-2 rounded-full bg-[#123c36] transition-all" style={{ width: `${Math.min(Number(c.percentage) || 0, 100)}%` }} />
                    </div>
                  </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Achievements */}
          {safeArr(report.achievements).length > 0 && (
            <div className="p-4 rounded-xl bg-green-50/50 border border-green-100">
              <h3 className="text-sm font-semibold text-green-800 mb-3 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Key Achievements ({safeArr(report.achievements).length})
              </h3>
              <ul className="space-y-1.5">
                {safeArr(report.achievements).map((a: unknown, i: number) => (
                  <li key={i} className="text-sm text-gray-600 flex items-start gap-2">
                    <span className="text-green-500 mt-0.5 shrink-0">•</span>
                    {String(a)}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Activity Timeline */}
          {safeArr(report.activityTimeline).length > 0 && (
            <div className="p-4 rounded-xl bg-gray-50 border border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Activity Timeline ({safeArr(report.activityTimeline).length} days)</h3>
              <ScrollArea className="max-h-[200px]">
                <div className="space-y-2 pr-4">
                  {safeArr(report.activityTimeline).map((entry: unknown, i: number) => {
                    const e = entry as Record<string, unknown>
                    const activities = safeArr(e.activities)
                    return (
                    <div key={i} className="flex items-start gap-3 pb-2 border-b border-gray-100 last:border-0">
                      <div className="w-20 shrink-0">
                        <p className="text-xs font-medium text-gray-500">{String(e.dateLabel || '')}</p>
                      </div>
                      <div className="flex-1 min-w-0">
                        {activities.slice(0, 2).map((act: unknown, j: number) => (
                          <p key={j} className="text-xs text-gray-600 truncate">{String(act)}</p>
                        ))}
                        {activities.length > 2 && (
                          <p className="text-[10px] text-gray-400">+{activities.length - 2} more</p>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] px-1.5 shrink-0">{String(e.primaryCategory || '')}</Badge>
                    </div>
                    )
                  })}
                </div>
              </ScrollArea>
            </div>
          )}

          {/* Export */}
          <div className="flex justify-end pt-2 border-t border-gray-100">
            <Button onClick={() => report.id && onExport(report.id)} className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg font-medium gap-2">
              <Download className="h-4 w-4" />
              Export to Excel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// =====================================================================
// ADMIN: MONTHLY REPORTS
// =====================================================================

function AdminMonthlyReports() {
  const qc = useQueryClient()
  const [genMonth, setGenMonth] = useState(format(new Date(), 'yyyy-MM'))
  const [selectedUserId, setSelectedUserId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [viewingReport, setViewingReport] = useState<any>(null)
  const [viewOpen, setViewOpen] = useState(false)
  const [filterMonth, setFilterMonth] = useState('')
  const [page, setPage] = useState(1)
  const [pageSize] = useState(20)
  const [sortBy, setSortBy] = useState('month')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [bulkGenerating, setBulkGenerating] = useState(false)
  const [bulkResults, setBulkResults] = useState<BulkGenerateResult[] | null>(null)

  const genMonthDate = parseISO(genMonth + '-01')

  // Fetch all employees
  const { data: empData } = useQuery<EmployeesData>({
    queryKey: ['admin-employees-all'],
    queryFn: () => apiGet<EmployeesData>('/api/admin/employees'),
  })
  const employees = empData?.employees || []

  // Fetch generated reports with pagination
  const { data, isLoading } = useQuery<MonthlyPaginatedReports>({
    queryKey: ['admin-monthly-reports', filterMonth, page, pageSize, sortBy, sortOrder, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('pageSize', String(pageSize))
      params.set('sort', sortBy)
      params.set('order', sortOrder)
      if (filterMonth) params.set('month', filterMonth)
      if (searchQuery) params.set('search', searchQuery)
      return apiGet<MonthlyPaginatedReports>(`/api/admin/reports/monthly?${params.toString()}`)
    },
  })

  const reports = data?.reports || []
  const totalPages = data?.totalPages || 1
  const total = data?.total || 0

  // Reset page when filters change
  const handleFilterChange = (key: string, value: string) => {
    if (key === 'month') setFilterMonth(value)
    setPage(1)
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearchQuery(searchInput.trim())
    setPage(1)
  }

  const handleGenerate = async () => {
    if (!selectedUserId) {
      toast.error('Please select an employee')
      return
    }
    setGenerating(true)
    try {
      const data = await apiPost('/api/admin/reports/monthly', {
        month: genMonth,
        userId: selectedUserId,
        force: true,
      })
      toast.success('Monthly report generated successfully!')
      qc.invalidateQueries({ queryKey: ['admin-monthly-reports'] })
      setViewingReport(data)
      setViewOpen(true)
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to generate report')
    } finally {
      setGenerating(false)
    }
  }

  const handleViewReport = async (reportId: string) => {
    try {
      const data = await apiGet(`/api/admin/reports/monthly/${reportId}`)
      setViewingReport(data)
      setViewOpen(true)
    } catch {
      toast.error('Failed to load report')
    }
  }

  const handleDeleteReport = async (reportId: string) => {
    try {
      await apiDelete(`/api/admin/reports/monthly/${reportId}`)
      toast.success('Report deleted')
      qc.invalidateQueries({ queryKey: ['admin-monthly-reports'] })
      setDeleteConfirmId(null)
    } catch {
      toast.error('Failed to delete report')
    }
  }

  const handleExport = async (reportId: string) => {
    try {
      const token = useAuthStore.getState().token
      const response = await fetch(`/api/admin/reports/monthly/export/${reportId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      })
      if (!response.ok) {
        if (response.status === 429) {
          toast.error('Rate limit reached. Please try again later.')
        } else {
          toast.error('Export failed')
        }
        return
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = response.headers.get('content-disposition')
      const fm = cd?.match(/filename="([^"]+)"/)
      a.download = fm?.[1] || 'monthly-report.xlsx'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Report exported!')
    } catch { toast.error('Export failed') }
  }

  const handleBulkGenerate = async (onlyMissing = false) => {
    setBulkGenerating(true)
    setBulkResults(null)
    try {
      const body: { month: string; onlyMissing: boolean } = { month: genMonth, onlyMissing }
      const response = await apiPost<{ results: BulkGenerateResult[]; summary: { total: number; success: number; failed: number }; message?: string }>('/api/admin/reports/monthly/bulk', body)
      const results = response.results || []
      setBulkResults(results)
      if (response.message) {
        toast.info(response.message)
      } else {
        const success = results.filter(r => r.success).length
        const failed = results.filter(r => !r.success).length
        toast.success(`Bulk generation complete: ${success} succeeded, ${failed} failed`)
      }
      qc.invalidateQueries({ queryKey: ['admin-monthly-reports'] })
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        toast.error('Rate limit reached. Please try again later.')
      } else {
        toast.error(err instanceof ApiError ? err.message : 'Bulk generation failed')
      }
    } finally {
      setBulkGenerating(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6">
      <Breadcrumb items={['Workspace', 'Monthly Reports']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Monthly Report Intelligence</h1>
        <p className="text-sm text-gray-500 mt-0.5">Generate professional monthly reports for employees</p>
      </div>

      {/* Generate Report Card */}
      <div className="product-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="h-5 w-5 text-[#123c36]" />
          <h2 className="text-base font-semibold text-gray-900">Generate Report</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">Select Employee</Label>
            <Select value={selectedUserId} onValueChange={setSelectedUserId}>
              <SelectTrigger className="h-10 rounded-lg border-gray-200">
                <SelectValue placeholder="Choose employee..." />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.username} — {emp.profile?.position || emp.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">Select Month</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setGenMonth(format(subMonths(genMonthDate, 1), 'yyyy-MM'))} className="rounded-lg border-gray-200 h-10 w-10">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold min-w-[130px] text-center">{format(genMonthDate, 'MMM yyyy')}</span>
              <Button variant="outline" size="icon" onClick={() => setGenMonth(format(addMonths(genMonthDate, 1), 'yyyy-MM'))} className="rounded-lg border-gray-200 h-10 w-10">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-end">
            <Button onClick={handleGenerate} disabled={generating || !selectedUserId} className="w-full bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg font-medium h-10">
              {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><BarChart3 className="mr-2 h-4 w-4" />Generate Report</>}
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-400">The engine analyzes daily reports, categorizes activities, and generates a professional structured report. Force-regenerate overwrites existing reports.</p>
      </div>

      {/* Bulk Generation Card */}
      <div className="product-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <UsersRound className="h-5 w-5 text-[#123c36]" />
          <h2 className="text-base font-semibold text-gray-900">Bulk Generation</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Generate monthly reports for all employees or only those missing reports.</p>
        <div className="flex flex-col sm:flex-row items-start sm:items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-gray-700">Month</Label>
            <span className="text-sm font-semibold">{format(genMonthDate, 'MMMM yyyy')}</span>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <Button variant="outline" size="sm" onClick={() => handleBulkGenerate(false)} disabled={bulkGenerating} className="rounded-lg border-gray-200 gap-1.5">
              {bulkGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BarChart3 className="h-3.5 w-3.5" />}
              Generate All
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBulkGenerate(true)} disabled={bulkGenerating} className="rounded-lg border-gray-200 gap-1.5">
              {bulkGenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
              Generate Missing Only
            </Button>
          </div>
        </div>
        {bulkGenerating && (
          <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-[#123c36]/5 border border-[#123c36]/10">
            <Loader2 className="h-4 w-4 animate-spin text-[#123c36]" />
            <p className="text-sm text-gray-600">Generating reports in progress...</p>
          </div>
        )}
        {bulkResults && (
          <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <span className="text-xs font-medium text-gray-700">Bulk Generation Results</span>
              <span className="text-xs text-gray-500">{bulkResults.filter(r => r.success).length}/{bulkResults.length} succeeded</span>
            </div>
            <ScrollArea className="max-h-48">
              {bulkResults.map((r, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 text-sm border-b border-gray-100 last:border-0">
                  {r.success ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : (
                    <X className="h-3.5 w-3.5 text-red-500 shrink-0" />
                  )}
                  <span className="text-gray-700">{r.username}</span>
                  {!r.success && r.error && (
                    <span className="text-xs text-red-400 ml-auto">{r.error}</span>
                  )}
                </div>
              ))}
            </ScrollArea>
          </div>
        )}
      </div>

      {/* Generated Reports */}
      <div className="product-card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-base font-semibold text-gray-900">Generated Reports ({total})</h2>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Search */}
            <form onSubmit={handleSearch} className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search employee..."
                className="h-8 w-[180px] pl-8 rounded-lg border-gray-200 text-xs"
              />
            </form>
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-3"><Skeleton className="h-14 w-full rounded-lg" /><Skeleton className="h-14 w-full rounded-lg" /><Skeleton className="h-14 w-full rounded-lg" /></div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center py-12">
            <BarChart3 className="h-12 w-12 text-gray-300 mb-3" />
            <p className="text-gray-500 font-medium">No reports generated yet</p>
            <p className="text-gray-400 text-sm mt-1">Select an employee and month above to generate</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader className="bg-gray-50/80">
                  <TableRow className="border-b border-gray-100 hover:bg-transparent">
                    <TableHead>Employee</TableHead>
                    <TableHead className="cursor-pointer select-none" onClick={() => { setSortBy('month'); setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc') }}>
                      <span className="flex items-center gap-1">Month {sortBy === 'month' && (sortOrder === 'desc' ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />)}</span>
                    </TableHead>
                    <TableHead className="text-right">Reports</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reports.map((r: any) => {
                    const mDate = parseISO(r.month + '-01')
                    return (
                      <TableRow key={r.id} className="border-b border-gray-50 last:border-0">
                        <TableCell className="text-sm font-medium text-gray-900">{r.user?.username || 'Unknown'}</TableCell>
                        <TableCell className="text-sm text-gray-600">{format(mDate, 'MMM yyyy')}</TableCell>
                        <TableCell className="text-sm text-gray-600 text-right">{r.totalReports}</TableCell>
                        <TableCell className="text-right"><Badge className={r.submissionRate >= 80 ? 'bg-green-50 text-green-700 rounded-full px-2 text-xs' : r.submissionRate >= 50 ? 'bg-amber-50 text-amber-700 rounded-full px-2 text-xs' : 'bg-red-50 text-red-700 rounded-full px-2 text-xs'}>{r.submissionRate}%</Badge></TableCell>
                        <TableCell className="text-right"><Badge className="bg-[#123c36]/10 text-[#123c36] rounded-full px-2 text-xs">{r.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewReport(r.id)}><Eye className="h-3.5 w-3.5 text-gray-500" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleExport(r.id)}><Download className="h-3.5 w-3.5 text-gray-500" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteConfirmId(r.id)}><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-[#c47b32]" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500">
                  Showing {((page - 1) * pageSize) + 1}–{Math.min(page * pageSize, total)} of {total}
                </p>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="h-8 rounded-lg border-gray-200" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                    Previous
                  </Button>
                  <span className="text-xs text-gray-600 px-2">
                    Page {page} of {totalPages}
                  </span>
                  <Button variant="outline" size="sm" className="h-8 rounded-lg border-gray-200" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Next
                    <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Monthly Report</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this monthly report? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (deleteConfirmId) handleDeleteReport(deleteConfirmId) }} className="bg-[#b9433f] hover:bg-[#9c3532]">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shared Report Viewer Dialog — reuse the same dialog as employee */}
      <ReportViewerDialog report={viewingReport} open={viewOpen} onOpenChange={setViewOpen} onExport={(id) => id && handleExport(id)} />
    </motion.div>
  )
}

// =====================================================================
// SETTINGS VIEW
// =====================================================================

const ORGANIZATION_TIMEZONES = [
  'Africa/Kampala',
  'Africa/Nairobi',
  'Africa/Dar_es_Salaam',
  'Africa/Lagos',
  'Africa/Cairo',
  'Africa/Johannesburg',
  'Europe/London',
  'UTC',
]

function OrganizationSettingsCard() {
  const [settings, setSettings] = useState<{ name: string; slug: string; timezone: string; reportDeadline: string; reminderEnabled: boolean } | null>(null)
  const [timezone, setTimezone] = useState('Africa/Kampala')
  const [deadline, setDeadline] = useState('16:00')
  const [reminderEnabled, setReminderEnabled] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    apiGet<{ name: string; slug: string; timezone: string; reportDeadline: string; reminderEnabled: boolean }>('/api/organizations/settings')
      .then((data) => {
        setSettings(data)
        setTimezone(data.timezone || 'Africa/Kampala')
        setDeadline(data.reportDeadline || '16:00')
        setReminderEnabled(Boolean(data.reminderEnabled))
      })
      .catch(() => toast.error('Unable to load organization settings'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      const updated = await apiPatch<{ name: string; slug: string; timezone: string; reportDeadline: string; reminderEnabled: boolean }>('/api/organizations/settings', {
        timezone,
        reportDeadline: deadline,
        reminderEnabled,
      })
      setSettings(updated)
      toast.success('Organization settings saved')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Unable to save organization settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="product-card p-6">
      <div className="flex items-center gap-2 mb-5">
        <Clock className="h-5 w-5 text-[#123c36]" />
        <h2 className="text-base font-semibold text-gray-900">Reporting preferences</h2>
      </div>
      <p className="text-sm text-gray-500 mb-5">Applies to everyone in your organization. Reminders are sent to employees who have not submitted by the deadline.</p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Organization</Label>
              <Input value={settings?.name ?? ''} disabled className="h-10 rounded-lg border-gray-200 bg-gray-50/60" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Timezone</Label>
              <Select value={timezone} onValueChange={(v) => setTimezone(v)}>
                <SelectTrigger className="w-full h-10 rounded-lg border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {ORGANIZATION_TIMEZONES.map((zone) => (
                    <SelectItem key={zone} value={zone}>{zone.replaceAll('_', ' ')}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium text-gray-700">Daily report deadline</Label>
              <input
                type="time"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value || '16:00')}
                className="h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm outline-none transition focus:border-[#123c36]"
                aria-label="Daily report deadline"
              />
              <p className="text-xs text-gray-400 mt-1">Local organization time (HH:MM).</p>
            </div>
            <div className="flex items-start justify-between gap-4 rounded-lg border border-gray-200 p-4">
              <div>
                <p className="text-sm font-medium text-gray-700">Daily reminders</p>
                <p className="mt-1 text-xs leading-5 text-gray-400">Notify employees without a submitted report.</p>
              </div>
              <Switch checked={reminderEnabled} onCheckedChange={(checked) => setReminderEnabled(checked)} aria-label="Toggle daily reminders" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg h-10 px-5">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save preferences
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

// =====================================================================
// PASSWORD STRENGTH (Settings change-password form)
// =====================================================================

function assessPasswordStrength(pw: string): { score: number; label: string; bar: string; text: string } {
  if (!pw) return { score: 0, label: '', bar: 'bg-gray-200', text: '' }
  let score = 0
  if (pw.length >= 8) score++
  if (pw.length >= 12) score++
  if (/[a-zA-Z]/.test(pw) && /[0-9]/.test(pw)) score++
  if (/[^a-zA-Z0-9]/.test(pw)) score++
  if (score <= 1) return { score: 1, label: 'Weak', bar: 'bg-red-400', text: 'text-red-600' }
  if (score === 2) return { score: 2, label: 'Fair', bar: 'bg-orange-400', text: 'text-orange-600' }
  if (score === 3) return { score: 3, label: 'Good', bar: 'bg-[#c47b32]', text: 'text-[#c47b32]' }
  return { score: 4, label: 'Strong', bar: 'bg-emerald-500', text: 'text-emerald-600' }
}

function SettingsView() {
  const user = useAuthStore((s) => s.user)
  const patchUser = useAuthStore((s) => s.patchUser)
  const logout = useAuthStore((s) => s.logout)
  const isAdminAccount = user?.role === 'admin' || user?.role === 'super_admin'
  const { t, locale, setLocale } = useTranslation()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPwd, setShowOldPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [changeLoading, setChangeLoading] = useState(false)
  const [forgotOpen, setForgotOpen] = useState(false)

  // Live password-policy signals driving the strength meter + checklist.
  const reqLength = newPassword.length >= 8
  const reqMixed = /[a-zA-Z]/.test(newPassword) && /[0-9]/.test(newPassword)
  const reqMatch = newPassword.length > 0 && newPassword === confirmPassword
  const canSubmit = reqLength && reqMixed && reqMatch
  const strength = assessPasswordStrength(newPassword)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!oldPassword) {
      toast.error('Enter your current password first')
      return
    }
    if (!reqLength) {
      toast.error('New password must be at least 8 characters long')
      return
    }
    if (!reqMixed) {
      toast.error('New password must contain at least one letter and one number')
      return
    }
    if (!reqMatch) {
      toast.error('New passwords do not match')
      return
    }
    setChangeLoading(true)
    try {
      const res = await apiPost<{ message?: string; passwordChangedAt?: string }>('/api/auth/change-password', { oldPassword, newPassword })
      toast.success('Password updated — other devices have been signed out.')
      patchUser({
        mustChangePassword: false,
        passwordChangedAt: res.passwordChangedAt ?? new Date().toISOString(),
      })
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : 'Failed to change password')
    } finally {
      setChangeLoading(false)
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-6 max-w-2xl">
      <Breadcrumb items={['Workspace', 'Settings']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and preferences</p>
      </div>

      {/* Account Information */}
      <div className="product-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <CircleUser className="h-5 w-5 text-[#123c36]" />
          <h2 className="text-base font-semibold text-gray-900">Account Information</h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">Username</p>
              <p className="text-sm font-medium text-gray-900">{user?.username}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Role</p>
              <Badge className={user?.role === 'admin' ? 'bg-[#123c36]/10 text-[#123c36] rounded-full px-2.5 text-xs font-medium' : 'bg-green-50 text-green-700 rounded-full px-2.5 text-xs font-medium'}>
                {user?.role === 'admin' ? 'Administrator' : 'Employee'}
              </Badge>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">Position</p>
              <p className="text-sm font-medium text-gray-900">{user?.profile?.position || 'Not assigned'}</p>
            </div>
            {user?.profile?.employeeId && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Employee ID</p>
                <p className="text-sm font-mono font-medium text-gray-900">{user.profile.employeeId}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div className="product-card p-6">
        <div className="flex flex-wrap items-center gap-2 mb-5">
          <Shield className="h-5 w-5 text-[#123c36]" />
          <h2 className="text-base font-semibold text-gray-900">Change Password</h2>
          <div className="ml-auto flex items-center gap-2">
            {user?.mustChangePassword ? (
              <Badge className="rounded-full border border-amber-200 bg-amber-100 px-2.5 text-xs font-medium text-amber-800">
                Temporary password
              </Badge>
            ) : user?.passwordChangedAt ? (
              <span className="text-xs text-gray-400" title="Password last changed">
                Updated {format(new Date(user.passwordChangedAt), 'MMM d, yyyy')}
              </span>
            ) : null}
          </div>
        </div>

        {user?.mustChangePassword && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-3">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <p className="text-xs leading-relaxed text-amber-900">
              This account is currently protected by a <span className="font-semibold">temporary password</span>. Choose a new one below — it will replace the temporary password immediately.
            </p>
          </div>
        )}

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="current-password" className="text-sm font-medium text-gray-700">Current Password</Label>
            <div className="relative">
              <Input
                id="current-password"
                type={showOldPwd ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter current password"
                autoComplete="current-password"
                className="h-10 rounded-lg border-gray-200 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowOldPwd(!showOldPwd)}
                aria-label={showOldPwd ? 'Hide current password' : 'Show current password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#123c36]/30"
              >
                {showOldPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-password" className="text-sm font-medium text-gray-700">New Password</Label>
            <div className="relative">
              <Input
                id="new-password"
                type={showNewPwd ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="At least 8 characters with letters and numbers"
                autoComplete="new-password"
                className="h-10 rounded-lg border-gray-200 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPwd(!showNewPwd)}
                aria-label={showNewPwd ? 'Hide new password' : 'Show new password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#123c36]/30"
              >
                {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {newPassword && (
              <div className="flex items-center gap-2 pt-1" aria-live="polite">
                <div className="flex flex-1 gap-1" aria-hidden="true">
                  {[1, 2, 3, 4].map((seg) => (
                    <div
                      key={seg}
                      className={`h-1.5 flex-1 rounded-full transition-colors duration-200 ${seg <= strength.score ? strength.bar : 'bg-gray-200'}`}
                    />
                  ))}
                </div>
                <span className={`text-xs font-medium ${strength.text}`}>{strength.label}</span>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password" className="text-sm font-medium text-gray-700">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirm-password"
                type={showConfirmPwd ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                autoComplete="new-password"
                className="h-10 rounded-lg border-gray-200 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                aria-label={showConfirmPwd ? 'Hide password confirmation' : 'Show password confirmation'}
                className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-0.5 text-gray-400 transition-colors hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#123c36]/30"
              >
                {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <ul className="space-y-1.5 rounded-lg bg-gray-50 px-3.5 py-3" aria-label="Password requirements">
            {[
              { met: reqLength, label: 'At least 8 characters' },
              { met: reqMixed, label: 'Contains letters and numbers' },
              { met: reqMatch, label: 'New passwords match' },
            ].map((req) => (
              <li key={req.label} className="flex items-center gap-2 text-xs">
                {req.met ? (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-100">
                    <Check className="h-3 w-3 text-emerald-600" />
                  </span>
                ) : (
                  <span className="flex h-4 w-4 items-center justify-center rounded-full bg-gray-200/70">
                    <X className="h-2.5 w-2.5 text-gray-400" />
                  </span>
                )}
                <span className={req.met ? 'text-gray-700' : 'text-gray-400'}>{req.label}</span>
              </li>
            ))}
          </ul>

          <Button
            type="submit"
            disabled={!canSubmit || changeLoading}
            className="bg-[#123c36] hover:bg-[#1d5249] text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {changeLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Changing...
              </>
            ) : (
              'Update Password'
            )}
          </Button>

          <div className="flex items-start gap-2 border-t border-gray-100 pt-3.5">
            <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#123c36]/50" />
            <p className="text-xs leading-relaxed text-gray-400">
              Changing your password signs out all other devices and sessions to keep your account safe.
            </p>
          </div>
        </form>
      </div>

      {/* Display Preferences */}
      <div className="product-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Globe className="h-5 w-5 text-[#123c36]" />
          <h2 className="text-base font-semibold text-gray-900">Display Preferences</h2>
        </div>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">Language</Label>
            <Select value={locale} onValueChange={(v) => setLocale(v as 'en' | 'lg' | 'sw')}>
              <SelectTrigger className="w-full sm:w-[220px] h-10 rounded-lg border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="lg">Luganda</SelectItem>
                <SelectItem value="sw">Swahili</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-gray-400 mt-1">Language preferences will be applied across the workspace.</p>
          </div>
        </div>
      </div>

      {/* Organization Reporting Preferences (admins only) */}
      {isAdminAccount && <OrganizationSettingsCard />}

      {/* Password Reset Request (employees — completes the review loop with the admin Overview card) */}
      {!isAdminAccount && (
        <div className="product-card p-6">
          <div className="flex items-center gap-2 mb-5">
            <Lock className="h-5 w-5 text-[#123c36]" />
            <h2 className="text-base font-semibold text-gray-900">Password reset request</h2>
          </div>
          <p className="text-sm text-gray-500 mb-4">
            Lost access to your account? Send a request to your organization administrator,
            who reviews it in the workspace overview and updates your credentials.
          </p>
          <Button
            variant="outline"
            className="border-gray-200 rounded-lg"
            onClick={() => setForgotOpen(true)}
          >
            <Lock className="mr-2 h-4 w-4" />
            Request password reset
          </Button>
        </div>
      )}

      <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} />

      {/* Logout */}
      <div className="product-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <LogOut className="h-5 w-5 text-[#c47b32]" />
          <h2 className="text-base font-semibold text-gray-900">Sign Out</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Sign out of your account on this device.</p>
        <Button
          variant="outline"
          className="border-[#c47b32]/20 text-[#c47b32] hover:bg-[#c47b32]/5 rounded-lg"
          onClick={() => logout()}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign Out
        </Button>
      </div>
    </motion.div>
  )
}

// =====================================================================
// MAIN HOME (SINGLE PAGE ROUTER)
// =====================================================================

export default function Home() {
  const router = useRouter()
  const { isAuthenticated, isAdmin, isInitialized, initialize, logout } = useAuthStore()
  const user = useAuthStore((s) => s.user)
  const [employeeView, setEmployeeView] = useState<EmployeeView>('submit')
  const [adminView, setAdminView] = useState<AdminView>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [searchTick, setSearchTick] = useState(0)
  const [helpOpen, setHelpOpen] = useState(false)
  const [securityBannerDismissed, setSecurityBannerDismissed] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  // Unauthenticated visitors are sent to the commercial NIWMS login.
  // /app is the authenticated workspace only — it must never render a login screen.
  useEffect(() => {
    if (isInitialized && !isAuthenticated) router.replace('/login')
  }, [isInitialized, isAuthenticated, router])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  // Listen for in-app navigation events from child components (role-agnostic:
  // admin children dispatch 'admin-navigate' too, e.g. the password-required
  // notice on the employee submit form navigates to Settings).
  useEffect(() => {
    const navHandler = (e: Event) => {
      const view = (e as CustomEvent).detail
      if (!view) return
      if (isAdmin) {
        setAdminView(view as AdminView)
      } else {
        setEmployeeView(view as EmployeeView)
      }
      window.scrollTo({ top: 0, behavior: 'instant' })
    }
    window.addEventListener('admin-navigate', navHandler)
    return () => window.removeEventListener('admin-navigate', navHandler)
  }, [isAdmin])

  const handleSearch = useCallback((query: string) => {
    if (isAdmin) {
      setAdminView('employees')
      setGlobalSearchQuery(query)
      // Clear after a tick so AdminEmployees picks it up
      setTimeout(() => setGlobalSearchQuery(''), 100)
    } else {
      // Remount-keyed handoff: the tick changes the EmployeeMyReports key so a
      // fresh mount initializes its search with the submitted query. Clearing
      // globalSearchQuery afterwards must not reset the visible search field.
      setEmployeeView('my-reports')
      setGlobalSearchQuery(query)
      setSearchTick((tick) => tick + 1)
      setTimeout(() => setGlobalSearchQuery(''), 100)
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [isAdmin])

  const handleNavigate = useCallback((view: string) => {
    if (isAdmin) {
      setAdminView(view as AdminView)
    } else {
      setEmployeeView(view as EmployeeView)
    }
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [isAdmin])

  const handleLogout = useCallback(() => {
    logout()
    setEmployeeView('submit')
    setAdminView('overview')
  }, [logout])

  // Loading state
  if (!isInitialized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#102f2b]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-pulse overflow-hidden rounded-2xl">
            <Image src="/logo.png" alt="Natural Intellects logo" width={48} height={48} className="h-full w-full object-contain" />
          </div>
          <p className="text-sm text-[#d5e3df]/60">Loading your workspace…</p>
        </div>
      </div>
    )
  }

  if (isInitialized && !isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#102f2b]">
        <div className="flex flex-col items-center gap-3">
          <div className="h-12 w-12 animate-pulse overflow-hidden rounded-2xl">
            <Image src="/logo.png" alt="Natural Intellects logo" width={48} height={48} className="h-full w-full object-contain" />
          </div>
          <p className="text-sm text-[#d5e3df]/60">Taking you to sign in…</p>
        </div>
      </div>
    )
  }

  // Dashboard layout
  const currentView = isAdmin ? adminView : employeeView

  const renderContent = () => {
    if (isAdmin) {
      switch (adminView) {
        case 'overview': return <AdminOverview />
        case 'employees': return <AdminEmployees initialSearch={globalSearchQuery || undefined} />
        case 'reports': return <AdminReports />
        case 'monthly-reports': return <AdminMonthlyReports />
        case 'export': return <AdminExport />
        case 'settings': return <SettingsView />
        default: return <AdminOverview />
      }
    } else {
      switch (employeeView) {
        case 'submit': return <EmployeeSubmitReport />
        case 'my-reports': return <EmployeeMyReports key={`my-reports-search-${searchTick}`} initialSearch={globalSearchQuery || undefined} />
        case 'monthly-reports': return <EmployeeMonthlyReports />
        case 'settings': return <SettingsView />
        default: return <EmployeeSubmitReport />
      }
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="product-shell min-h-screen bg-[#f4f6f8]">
        {/* Help Center Dialog */}
        <HelpCenterDialog open={helpOpen} onOpenChange={setHelpOpen} />

        {/* Sidebar */}
        <Sidebar
          isAdmin={isAdmin}
          currentView={currentView}
          onNavigate={handleNavigate}
          onLogout={handleLogout}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
          onHelpOpen={() => setHelpOpen(true)}
        />

        {/* Main content area - offset for fixed sidebar on desktop */}
        <style>{`
          @media (min-width: 1024px) {
            .dashboard-main { margin-left: ${sidebarCollapsed ? '72px' : '250px'}; }
          }
        `}</style>
        <div className="dashboard-main flex flex-col min-h-screen transition-all duration-300">
          {/* Top Header */}
          <TopHeader
            onMenuToggle={() => setMobileOpen(!mobileOpen)}
            mobileOpen={mobileOpen}
            onMobileOpenChange={setMobileOpen}
            isAdmin={isAdmin}
            currentView={currentView}
            onNavigate={handleNavigate}
            onSearch={handleSearch}
            onHelpOpen={() => setHelpOpen(true)}
          />

          {/* Temporary-password security nudge (first login after provisioning) */}
          {user?.mustChangePassword && !securityBannerDismissed && currentView !== 'settings' && (
            <div className="px-4 lg:px-6 pt-3">
              <div className="max-w-7xl mx-auto">
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className="flex flex-col gap-3 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 sm:flex-row sm:items-center"
                  role="alert"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100">
                    <KeyRound className="h-4.5 w-4.5 text-amber-700" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-amber-900">You&rsquo;re signed in with a temporary password</p>
                    <p className="text-xs text-amber-800/80">Set a new password now to keep your workspace secure — it only takes a moment.</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleNavigate('settings')}
                      className="h-8 rounded-lg bg-[#c47b32] px-3 text-xs font-medium text-white hover:bg-[#a96a2b]"
                    >
                      <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                      Set new password
                    </Button>
                    <button
                      type="button"
                      onClick={() => setSecurityBannerDismissed(true)}
                      aria-label="Dismiss temporary password notice"
                      className="rounded-md p-1.5 text-amber-700/70 transition-colors hover:bg-amber-100 hover:text-amber-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </motion.div>
              </div>
            </div>
          )}

          {/* Content */}
          <main className="flex-1 px-4 pt-2 pb-4 lg:px-6 lg:pb-6">
            <div className="max-w-7xl mx-auto">
              <AnimatePresence mode="wait">
                {renderContent()}
              </AnimatePresence>
            </div>
          </main>

          {/* Footer */}
          <footer className="mt-auto border-t border-gray-200/80 bg-white px-4 lg:px-6 py-3">
            <div className="max-w-7xl mx-auto flex items-center justify-between">
              <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Natural Intellects Ltd. All rights reserved.</p>
              <p className="text-xs text-gray-400 hidden sm:block">NIWMS · Natural Intellects Workforce Management System</p>
            </div>
          </footer>
        </div>
      </div>
      <Toaster position="top-right" richColors theme="light" />
    </QueryClientProvider>
  )
}
