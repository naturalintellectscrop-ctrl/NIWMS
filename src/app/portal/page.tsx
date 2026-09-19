'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { QueryClient, QueryClientProvider, useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
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
  Info, Globe, Phone, Mail, BookOpen, MonitorSmartphone,
  BarChart3, RefreshCw, UsersRound,
} from 'lucide-react'

import { useAuthStore, type User } from '@/store/auth-store'
import { useTranslation } from '@/lib/i18n'
import { apiPost, apiGet, apiPut, apiDelete, apiPatch, ApiError } from '@/lib/api'
import type { MonthlyReportListItem, MonthlyReportDetail, BulkGenerateResult, PaginatedReports as MonthlyPaginatedReports } from '@/types/report'

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
// NAVIGATION ITEMS
// =====================================================================

const adminNavItems: { key: AdminView; label: string; icon: React.ReactNode }[] = [
  { key: 'overview', label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" /> },
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

  const faqs = [
    {
      q: 'How do I submit a daily report?',
      a: 'Go to the Dashboard (employee view) and fill out the Daily Activity Report form. Select the date, describe your activities, and click "Submit Report". You can only submit one report per day.',
    },
    {
      q: 'What is the daily report deadline?',
      a: 'Reports should be submitted by 6:00 PM daily. The system tracks consistent reporting for performance review purposes.',
    },
    {
      q: 'How do I reset my password?',
      a: 'Click "Forgot Password?" on the login page and submit a request. The administrator will review it and update your credentials.',
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
            <HelpCircle className="h-5 w-5 text-[#0B1F6D]" />
            Help Center
          </SheetTitle>
          <SheetDescription>Find answers to common questions and contact support</SheetDescription>
        </SheetHeader>

        <div className="px-6 pb-8 space-y-6">
          {/* FAQ Section */}
          <div>
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <BookOpen className="h-4 w-4 text-[#0B1F6D]" />
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
              <MessageSquare className="h-4 w-4 text-[#0B1F6D]" />
              Contact Support
            </h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <Mail className="h-4 w-4 text-[#0B1F6D]" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Email</p>
                  <p className="text-xs text-gray-500">ugandafmi3@gmail.com</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <Phone className="h-4 w-4 text-[#0B1F6D]" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Phone</p>
                  <p className="text-xs text-gray-500">+256782823117</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                <MonitorSmartphone className="h-4 w-4 text-[#0B1F6D]" />
                <div>
                  <p className="text-sm font-medium text-gray-700">Office Hours</p>
                  <p className="text-xs text-gray-500">Mon - Fri, 8:00 AM - 5:00 PM EAT</p>
                </div>
              </div>
            </div>
          </div>

          {/* System Info */}
          <div className="rounded-xl bg-[#0B1F6D]/5 border border-[#0B1F6D]/10 p-4">
            <h3 className="text-sm font-semibold text-[#0B1F6D] flex items-center gap-2 mb-2">
              <Info className="h-4 w-4" />
              System Information
            </h3>
            <div className="space-y-1.5 text-xs text-gray-500">
              <p><span className="font-medium text-gray-700">Version:</span> 2.1.0</p>
              <p><span className="font-medium text-gray-700">Platform:</span> Natural Intellects Operations Portal</p>
              <p><span className="font-medium text-gray-700">Last Updated:</span> June 2025</p>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
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
        background: '#0B1F6D',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10 shrink-0">
        <div className="w-9 h-9 rounded-xl overflow-hidden shrink-0">
          <Image src="/logo.png" alt="Natural Intellects logo" width={36} height={36} className="w-full h-full object-contain" />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="text-sm font-bold text-white leading-none tracking-tight">{t('sidebar.portal')}</h1>
            <p className="text-[10px] text-blue-300/60 mt-0.5">{t('sidebar.operationsPortal')}</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto sidebar-scrollbar py-4 px-3 space-y-1">
        {!collapsed && isAdmin && (
          <p className="text-[10px] font-semibold text-blue-300/40 uppercase tracking-wider px-3 mb-2">{t('sidebar.navigation')}</p>
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
                : 'text-blue-200/70 hover:bg-white/8 hover:text-white'
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
            className={`w-full flex items-center gap-3 rounded-lg text-sm font-medium text-white bg-[#D94B2B]/90 hover:bg-[#D94B2B] transition-all ${
              collapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2.5'
            }`}
            title={collapsed ? t('nav.submitReport') : undefined}
          >
            <Send className="h-4 w-4" />
            {!collapsed && t('nav.submitReport')}
          </button>
        )}

        {!collapsed && (
          <button onClick={onHelpOpen} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200/70 hover:bg-white/8 hover:text-white transition-all">
            <HelpCircle className="h-4 w-4" />
            {t('nav.helpCenter')}
          </button>
        )}

        {collapsed && (
          <button onClick={onHelpOpen} className="w-full flex items-center justify-center px-2 py-2.5 rounded-lg text-sm font-medium text-blue-200/70 hover:bg-white/8 hover:text-white transition-all" title={t('nav.helpCenter')}>
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
              <p className="text-[10px] text-blue-300/50">
                {user?.role === 'admin' ? t('sidebar.administrator') : (user?.profile?.position || user?.role)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Copyright */}
      {!collapsed && (
        <div className="px-4 pb-3">
          <p className="text-[9px] text-blue-300/25 leading-tight">
            &copy; {new Date().getFullYear()} {t('sidebar.copyright')}
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
      <SheetContent side="left" className="p-0 w-[260px]" style={{ background: '#0B1F6D' }}>
        <SheetTitle className="sr-only">{t('sidebar.navigation')}</SheetTitle>
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 h-16 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl overflow-hidden">
            <Image src="/logo.png" alt="Natural Intellects logo" width={36} height={36} className="w-full h-full object-contain" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white leading-none">{t('sidebar.portal')}</h1>
            <p className="text-[10px] text-blue-300/60 mt-0.5">{t('sidebar.operationsPortal')}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="py-4 px-3 space-y-1">
          {isAdmin && (
            <p className="text-[10px] font-semibold text-blue-300/40 uppercase tracking-wider px-3 mb-2">{t('sidebar.navigation')}</p>
          )}
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => { onNavigate(item.key); onOpenChange(false) }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                currentView === item.key
                  ? 'bg-white/15 text-white'
                  : 'text-blue-200/70 hover:bg-white/8 hover:text-white'
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
              <p className="text-[10px] text-blue-300/50">
                {user?.role === 'admin' ? t('sidebar.administrator') : (user?.profile?.position || user?.role)}
              </p>
            </div>
          </div>
          <button
            onClick={() => { onHelpOpen(); onOpenChange(false) }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-blue-200/70 hover:bg-white/8 hover:text-white transition-all"
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
  const qc = useQueryClient()
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
      <header className="sticky top-0 z-30 w-full h-16 bg-white border-b border-gray-200/80 flex items-center px-4 lg:px-6 gap-4">
        {/* Mobile menu button */}
        <button
          onClick={onMenuToggle}
          className="lg:hidden flex items-center justify-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Breadcrumb / Title */}
        <div className="hidden lg:block">
          <p className="text-xs text-gray-400">Portal</p>
          <p className="text-sm font-semibold text-gray-900">Natural Intellects</p>
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex-1 max-w-md mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              placeholder="Search employees, reports, or positions..."
              className="h-10 pl-10 rounded-lg border-gray-200 bg-gray-50/50 text-sm focus:bg-white"
            />
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
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-[#D94B2B] text-white text-[10px] font-bold rounded-full flex items-center justify-center">
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
            <div className="w-9 h-9 rounded-full bg-[#0B1F6D] flex items-center justify-center">
              <span className="text-xs font-bold text-white uppercase">{(user?.username || 'U').charAt(0)}</span>
            </div>
            <div className="hidden md:block">
              <p className="text-sm font-medium text-gray-900 leading-none">{user?.username}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {user?.role === 'admin' ? (
                  <span className="inline-flex items-center gap-1">
                    <span className="px-1.5 py-0.5 bg-[#0B1F6D] text-white text-[9px] font-bold rounded leading-none">ADMIN</span>
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
              <Bell className="h-5 w-5 text-[#0B1F6D]" />
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
                        <button onClick={markAllRead} className="text-[10px] font-medium text-[#0B1F6D] hover:underline">
                          {t('notifications.markAllRead')}
                        </button>
                      )}
                    </div>
                    <ScrollArea className="max-h-[400px]">
                      <div className="space-y-2">
                        {notifications.slice(0, 20).map((notif) => {
                          const iconBg = notif.type === 'warning' ? 'bg-amber-50' : notif.type === 'success' ? 'bg-green-50' : notif.type === 'announcement' ? 'bg-purple-50' : notif.type === 'reminder' ? 'bg-blue-50' : 'bg-gray-50'
                          const iconColor = notif.type === 'warning' ? 'text-amber-500' : notif.type === 'success' ? 'text-green-600' : notif.type === 'announcement' ? 'text-purple-500' : notif.type === 'reminder' ? 'text-blue-500' : 'text-gray-500'
                          const IconComp = notif.type === 'warning' ? AlertCircle : notif.type === 'success' ? CheckCircle2 : notif.type === 'reminder' ? Clock : Info
                          return (
                            <button
                              key={notif.id}
                              onClick={() => { if (!notif.read) markOneRead(notif.id) }}
                              className={`w-full text-left flex items-start gap-3 p-3 rounded-lg border transition-colors ${notif.read ? 'border-transparent opacity-60' : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'}`}
                            >
                              <div className={`w-9 h-9 rounded-full ${iconBg} flex items-center justify-center shrink-0 mt-0.5`}>
                                <IconComp className={`h-4 w-4 ${iconColor}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className={`text-sm font-medium text-gray-900 ${!notif.read ? 'font-semibold' : ''}`}>{notif.title}</p>
                                  {!notif.read && <span className="w-2 h-2 rounded-full bg-[#0B1F6D] shrink-0" />}
                                </div>
                                <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line line-clamp-3">{notif.message}</p>
                                <p className="text-[10px] text-gray-400 mt-1">
                                  {format(parseISO(notif.createdAt), 'MMM d \'at\' h:mm a')}
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
                                <p className="text-[10px] text-gray-400 mt-1">
                                  {format(parseISO(req.createdAt), 'MMM d, yyyy \'at\' h:mm a')}
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
      <div className="ufmi-card p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              Password Reset Requests
              {pendingCount > 0 && (
                <Badge className="bg-[#D94B2B]/10 text-[#D94B2B] rounded-full px-2.5 text-xs font-bold">
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
      <Breadcrumb items={['Portal', 'Dashboard']} />
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight">Operational Overview</h1>
          <p className="text-sm text-gray-500 mt-0.5">Live metrics for the Operations intelligence for growing organizations</p>
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
            className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg text-xs font-medium gap-1.5 h-9 px-4"
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
              className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg"
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
        <div className="ufmi-card p-8 flex flex-col items-center text-center">
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
            <div className="ufmi-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Total Employees</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalEmployees}</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-[#0B1F6D]/5 flex items-center justify-center">
                  <Users className="h-5 w-5 text-[#0B1F6D]" />
                </div>
              </div>
              <Badge className="mt-3 bg-green-50 text-green-700 border-green-200 rounded-full px-2 text-[10px] font-medium">
                +12% from last month
              </Badge>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
          >
            <div className="ufmi-card p-6">
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
            <div className="ufmi-card p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-gray-500">Pending Reports</p>
                  <p className="text-3xl font-bold text-gray-900 mt-1">{Math.max(pendingReports, 0)}</p>
                </div>
                <Badge className="bg-[#D94B2B]/10 text-[#D94B2B] rounded-full px-2.5 text-[10px] font-bold mt-1">
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
          <div className="ufmi-card-dark p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-blue-200/60">Compliance Score</p>
                <p className="text-3xl font-bold text-white mt-1">{complianceScore}%</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-[#F4B400] rounded-full transition-all" style={{ width: `${complianceScore}%` }} />
            </div>
          </div>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Position Breakdown */}
        <div className="ufmi-card p-6">
          <div className="mb-5">
            <h2 className="text-base font-semibold text-gray-900">Position Breakdown</h2>
            <p className="text-sm text-gray-500 mt-0.5">Active employees by position</p>
          </div>
          <ScrollArea className="max-h-[280px]">
            <div className="space-y-1">
              {stats.missingTodayReports.length === 0 && (
                <p className="text-gray-400 text-sm py-4">All employees have submitted reports today.</p>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Missing Today's Reports */}
        <div className="ufmi-card p-6">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                Missing Today&apos;s Reports
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">Employees who haven&apos;t submitted</p>
            </div>
            {stats.missingTodayReports.length > 0 && (
              <Badge className="bg-[#D94B2B]/10 text-[#D94B2B] rounded-full px-2.5 text-xs font-bold">
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
                    <div className="w-8 h-8 rounded-full bg-[#0B1F6D]/5 flex items-center justify-center shrink-0">
                      <span className="text-xs font-bold text-[#0B1F6D] uppercase">{emp.username.charAt(0)}</span>
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

      {/* Recent Reports */}
      <div className="ufmi-card p-6">
        <div className="mb-5">
          <h2 className="text-base font-semibold text-gray-900">Recent Reports</h2>
          <p className="text-sm text-gray-500 mt-0.5">Last 10 submitted reports</p>
        </div>
        {stats.recentReports.length === 0 ? (
          <p className="text-gray-400 text-sm py-4">No reports submitted yet.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <Table>
              <TableHeader className="ufmi-table-header bg-gray-50/80">
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
    },
    onError: (err) => {
      if (err instanceof ApiError) {
        toast.error(err.message)
      } else {
        toast.error('Failed to submit report')
      }
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
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

  const user = useAuthStore((s) => s.user)

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
          className="flex items-center justify-between gap-4 rounded-xl bg-[#D94B2B]/5 border border-[#D94B2B]/15 px-5 py-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#D94B2B]/10 flex items-center justify-center">
              <AlertCircle className="h-5 w-5 text-[#D94B2B]" />
            </div>
            <div>
              <p className="text-sm font-semibold text-[#D94B2B]">You have not submitted today&apos;s report</p>
              <p className="text-xs text-[#D94B2B]/60 mt-0.5">Please submit your daily activity report before the deadline.</p>
            </div>
          </div>
          <Button size="sm" className="bg-[#D94B2B] hover:bg-[#c4411f] text-white rounded-lg shrink-0" onClick={() => document.getElementById('report-form')?.scrollIntoView({ behavior: 'smooth' })}>
            Submit Now
          </Button>
        </motion.div>
      )}

      {/* Welcome card */}
      <div className="ufmi-card-dark p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm text-blue-200/50">{format(today, 'EEEE, MMMM d, yyyy')}</p>
            <h2 className="text-lg font-bold text-white mt-1">
              Welcome back, {user?.username}
            </h2>
            <p className="text-sm text-blue-200/60 mt-0.5">
              {user?.profile?.position}
            </p>
          </div>
          <Button
            className="bg-white text-[#0B1F6D] hover:bg-gray-100 rounded-lg font-medium"
            onClick={() => document.getElementById('report-form')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <Send className="mr-2 h-4 w-4" />
            Submit Daily Report
          </Button>
        </div>
      </div>

      {/* Report form */}
      <div id="report-form" className="ufmi-card p-6 max-w-3xl">
        <h3 className="text-base font-semibold text-gray-900 mb-5">Report Details</h3>
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
              disabled={submitMutation.isPending || !!existingReport}
              className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg font-medium"
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
        <div className="rounded-xl bg-blue-50/50 border border-blue-100 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="h-4 w-4 text-[#0B1F6D]" />
            <p className="text-xs font-semibold text-[#0B1F6D]">Deadline</p>
          </div>
          <p className="text-xs text-gray-500">Reports should be submitted by 6:00 PM daily</p>
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

function EmployeeMyReports() {
  const { t } = useTranslation()
  const [currentMonth, setCurrentMonth] = useState(new Date())
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

      {/* Month navigation */}
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

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="ufmi-card border-dashed flex flex-col items-center justify-center py-16">
          <FileText className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No reports for this month</p>
          <p className="text-gray-400 text-sm mt-1">Submit your first report for the selected month</p>
        </div>
      ) : (
        <div className="ufmi-card overflow-hidden">
          <Table>
            <TableHeader className="ufmi-table-header bg-gray-50/80">
              <TableRow className="border-b border-gray-100 hover:bg-transparent">
                <TableHead>Date</TableHead>
                <TableHead>Report Subject</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {reports.map((report) => (
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
                        <Trash2 className="h-3.5 w-3.5 text-gray-500 hover:text-[#D94B2B]" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <button className="text-sm font-medium text-[#0B1F6D] hover:text-[#1e3a8a] transition-colors">
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
              className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg"
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
              className="bg-[#D94B2B] hover:bg-[#c4411f] text-white rounded-lg"
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
      <Breadcrumb items={['Portal', 'Workforce Management']} />
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
            className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg text-xs font-medium gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Create Employee
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="ufmi-card p-4">
          <p className="text-xs text-gray-500">Total Employees</p>
          <p className="text-xl font-bold text-gray-900 mt-1">{employees.length}</p>
        </div>
        <div className="ufmi-card p-4">
          <p className="text-xs text-gray-500">Active Roles</p>
          <p className="text-xl font-bold text-green-600 mt-1">{activeCount}</p>
        </div>
        <div className="ufmi-card p-4">
          <p className="text-xs text-gray-500">Suspended</p>
          <p className="text-xl font-bold text-amber-600 mt-1">{suspendedCount}</p>
        </div>
        <div className="ufmi-card p-4">
          <p className="text-xs text-gray-500">Archived</p>
          <p className="text-xl font-bold text-gray-400 mt-1">{archivedCount}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="ufmi-card p-4">
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
        <div className="ufmi-card p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="ufmi-card border-dashed flex flex-col items-center py-16">
          <Users className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No employees found</p>
          <p className="text-gray-400 text-sm mt-1">Try adjusting your filters or add a new employee</p>
        </div>
      ) : (
        <div className="ufmi-card overflow-hidden">
          <ScrollArea className="h-[60vh] min-h-[300px]">
            <Table>
              <TableHeader className="ufmi-table-header bg-gray-50/80">
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
                        <div className="w-7 h-7 rounded-full bg-[#0B1F6D]/5 flex items-center justify-center shrink-0">
                          <span className="text-[10px] font-bold text-[#0B1F6D] uppercase">{emp.username.charAt(0)}</span>
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
                          <Trash2 className="h-3.5 w-3.5 text-gray-500 hover:text-[#D94B2B]" />
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
              className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg"
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
              className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg"
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
              className="bg-[#D94B2B] hover:bg-[#c4411f] text-white rounded-lg"
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
      <Breadcrumb items={['Portal', 'Reports']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">All Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">View and filter all employee reports</p>
      </div>

      {/* Filters */}
      <div className="ufmi-card p-4">
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
        <div className="ufmi-card p-4 space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      ) : reports.length === 0 ? (
        <div className="ufmi-card border-dashed flex flex-col items-center py-16">
          <FileText className="h-12 w-12 text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">No reports found</p>
          <p className="text-gray-400 text-sm mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="ufmi-card overflow-hidden">
          <ScrollArea className="h-[60vh] min-h-[300px]">
            <Table>
              <TableHeader className="ufmi-table-header bg-gray-50/80">
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
        headers: { Authorization: `Bearer ${token}` },
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
      <Breadcrumb items={['Portal', 'Export']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Export Reports</h1>
        <p className="text-sm text-gray-500 mt-0.5">Download monthly reports as Excel file</p>
      </div>

      <div className="ufmi-card p-6 max-w-lg">
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

          <div className="rounded-xl bg-[#0B1F6D]/3 border border-[#0B1F6D]/10 p-5 space-y-2">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#0B1F6D]" />
              <p className="text-sm font-semibold text-[#0B1F6D]">Export Summary</p>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">
              This will download an Excel file containing all daily reports for <strong>{format(monthDate, 'MMMM yyyy')}</strong>.
              The file includes a <strong>Daily Reports</strong> sheet with full details (Activity, Location, Time In/Out, Comments) and an <strong>Employee Summary</strong> sheet.
            </p>
          </div>

          <Button
            onClick={handleExport}
            disabled={exporting}
            className="w-full bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg font-medium h-11"
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
        headers: { Authorization: `Bearer ${token}` },
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
      <div className="ufmi-card p-6 max-w-2xl">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="h-5 w-5 text-[#0B1F6D]" />
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
          <div className="rounded-xl bg-[#0B1F6D]/5 border border-[#0B1F6D]/10 p-4">
            <p className="text-xs text-gray-500 leading-relaxed">
              This will analyze all your daily reports for <strong>{format(genMonthDate, 'MMMM yyyy')}</strong>,
              categorize activities, calculate statistics, and produce a professional monthly report.
              The report will be saved and can be exported to Excel.
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg font-medium"
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
      <div className="ufmi-card p-6">
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
                    <div className="w-10 h-10 rounded-lg bg-[#0B1F6D]/10 flex items-center justify-center">
                      <FileText className="h-5 w-5 text-[#0B1F6D]" />
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
                    <Button variant="ghost" size="sm" className="rounded-lg text-xs gap-1.5 text-gray-500 hover:text-[#0B1F6D]" onClick={() => setRegenerateConfirm(report.month)} title="Regenerate this report">
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
            <AlertDialogAction onClick={() => { if (regenerateConfirm) regenerateMutation.mutate(regenerateConfirm) }} className="bg-[#0B1F6D] hover:bg-[#1e3a8a]">
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
            <BarChart3 className="h-5 w-5 text-[#0B1F6D]" />
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
            <div className="p-3 rounded-lg bg-[#0B1F6D]/5 border border-[#0B1F6D]/10">
              <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Submission Rate</p>
              <p className="text-xl font-bold text-[#0B1F6D]">{safeNum(stats.submissionRate)}%</p>
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
          <div className="p-4 rounded-xl bg-[#0B1F6D]/5 border border-[#0B1F6D]/10">
            <h3 className="text-sm font-semibold text-[#0B1F6D] mb-2 flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Executive Summary
            </h3>
            <p className="text-sm text-gray-600 leading-relaxed">{report.summary}</p>
            {report.dominantFocus && (
              <p className="text-xs text-[#0B1F6D] mt-2 font-medium">Dominant Focus: {report.dominantFocus}</p>
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
                    <span className="text-[#0B1F6D] font-bold">{i + 1}.</span>
                    {String(area)}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Category Breakdown */}
          {safeArr(report.categoryBreakdown).length > 0 && (
            <div className="p-4 rounded-xl bg-blue-50/50 border border-blue-100">
              <h3 className="text-sm font-semibold text-blue-800 mb-3">Activity Breakdown</h3>
              <div className="space-y-2.5">
                {safeArr(report.categoryBreakdown).map((cat: unknown, i: number) => {
                  const c = cat as Record<string, unknown>
                  return (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-700">{String(c.category || 'Unknown')}</span>
                      <span className="text-xs text-gray-400">{String(c.count ?? 0)} activities ({String(c.percentage ?? 0)}%)</span>
                    </div>
                    <div className="w-full bg-blue-100 rounded-full h-2">
                      <div className="h-2 rounded-full bg-[#0B1F6D] transition-all" style={{ width: `${Math.min(Number(c.percentage) || 0, 100)}%` }} />
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
            <Button onClick={() => report.id && onExport(report.id)} className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg font-medium gap-2">
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
        headers: { Authorization: `Bearer ${token}` },
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
      <Breadcrumb items={['Portal', 'Monthly Reports']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Monthly Report Intelligence</h1>
        <p className="text-sm text-gray-500 mt-0.5">Generate professional monthly reports for employees</p>
      </div>

      {/* Generate Report Card */}
      <div className="ufmi-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <BarChart3 className="h-5 w-5 text-[#0B1F6D]" />
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
            <Button onClick={handleGenerate} disabled={generating || !selectedUserId} className="w-full bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg font-medium h-10">
              {generating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating...</> : <><BarChart3 className="mr-2 h-4 w-4" />Generate Report</>}
            </Button>
          </div>
        </div>
        <p className="text-xs text-gray-400">The engine analyzes daily reports, categorizes activities, and generates a professional structured report. Force-regenerate overwrites existing reports.</p>
      </div>

      {/* Bulk Generation Card */}
      <div className="ufmi-card p-6">
        <div className="flex items-center gap-2 mb-4">
          <UsersRound className="h-5 w-5 text-[#0B1F6D]" />
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
          <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-[#0B1F6D]/5 border border-[#0B1F6D]/10">
            <Loader2 className="h-4 w-4 animate-spin text-[#0B1F6D]" />
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
      <div className="ufmi-card p-6">
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
                        <TableCell className="text-right"><Badge className="bg-blue-50 text-blue-700 rounded-full px-2 text-xs">{r.status}</Badge></TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewReport(r.id)}><Eye className="h-3.5 w-3.5 text-gray-500" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleExport(r.id)}><Download className="h-3.5 w-3.5 text-gray-500" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setDeleteConfirmId(r.id)}><Trash2 className="h-3.5 w-3.5 text-gray-400 hover:text-[#D94B2B]" /></Button>
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
            <AlertDialogAction onClick={() => { if (deleteConfirmId) handleDeleteReport(deleteConfirmId) }} className="bg-[#D94B2B] hover:bg-[#c43d20]">
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

function SettingsView() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  const { t, locale, setLocale } = useTranslation()

  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showOldPwd, setShowOldPwd] = useState(false)
  const [showNewPwd, setShowNewPwd] = useState(false)
  const [showConfirmPwd, setShowConfirmPwd] = useState(false)
  const [changeLoading, setChangeLoading] = useState(false)

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!oldPassword || !newPassword || !confirmPassword) {
      toast.error('All fields are required')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      toast.error('New password must be at least 6 characters')
      return
    }
    setChangeLoading(true)
    try {
      await apiPost('/api/auth/change-password', { oldPassword, newPassword })
      toast.success('Password changed successfully!')
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
      <Breadcrumb items={['Portal', 'Settings']} />
      <div>
        <h1 className="text-xl font-bold text-gray-900 tracking-tight">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manage your account and preferences</p>
      </div>

      {/* Account Information */}
      <div className="ufmi-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <CircleUser className="h-5 w-5 text-[#0B1F6D]" />
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
              <Badge className={user?.role === 'admin' ? 'bg-[#0B1F6D]/10 text-[#0B1F6D] rounded-full px-2.5 text-xs font-medium' : 'bg-green-50 text-green-700 rounded-full px-2.5 text-xs font-medium'}>
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
      <div className="ufmi-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Shield className="h-5 w-5 text-[#0B1F6D]" />
          <h2 className="text-base font-semibold text-gray-900">Change Password</h2>
        </div>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">Current Password</Label>
            <div className="relative">
              <Input
                type={showOldPwd ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="Enter current password"
                className="h-10 rounded-lg border-gray-200 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowOldPwd(!showOldPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showOldPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">New Password</Label>
            <div className="relative">
              <Input
                type={showNewPwd ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                className="h-10 rounded-lg border-gray-200 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowNewPwd(!showNewPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm font-medium text-gray-700">Confirm New Password</Label>
            <div className="relative">
              <Input
                type={showConfirmPwd ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter new password"
                className="h-10 rounded-lg border-gray-200 pr-10"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirmPwd(!showConfirmPwd)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showConfirmPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <Button
            type="submit"
            disabled={changeLoading}
            className="bg-[#0B1F6D] hover:bg-[#1e3a8a] text-white rounded-lg font-medium"
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
        </form>
      </div>

      {/* Display Preferences */}
      <div className="ufmi-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <Globe className="h-5 w-5 text-[#0B1F6D]" />
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
            <p className="text-xs text-gray-400 mt-1">Language preferences will be applied across the portal.</p>
          </div>
        </div>
      </div>

      {/* Logout */}
      <div className="ufmi-card p-6">
        <div className="flex items-center gap-2 mb-5">
          <LogOut className="h-5 w-5 text-[#D94B2B]" />
          <h2 className="text-base font-semibold text-gray-900">Sign Out</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Sign out of your account on this device.</p>
        <Button
          variant="outline"
          className="border-[#D94B2B]/20 text-[#D94B2B] hover:bg-[#D94B2B]/5 rounded-lg"
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
  const [employeeView, setEmployeeView] = useState<EmployeeView>('submit')
  const [adminView, setAdminView] = useState<AdminView>('overview')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [globalSearchQuery, setGlobalSearchQuery] = useState('')
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    initialize()
  }, [initialize])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [])

  // Listen for admin navigation events from child components
  useEffect(() => {
    const navHandler = (e: Event) => {
      const view = (e as CustomEvent).detail
      if (isAdmin && view) {
        setAdminView(view as AdminView)
        window.scrollTo({ top: 0, behavior: 'instant' })
      }
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
      toast.info(`Searching for "${query}"`)
    } else {
      setEmployeeView('my-reports')
      toast.info(`Searching for "${query}"`)
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

  // Tenant-aware access: the portal experience is reached through the unified
  // /login (company + username + password). Unauthenticated visitors are sent
  // there instead of being offered a company-less legacy form.
  useEffect(() => {
    if (isInitialized && !isAuthenticated) router.replace('/login')
  }, [isInitialized, isAuthenticated, router])

  // Loading state
  if (!isInitialized) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0B1F6D' }}>
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden animate-pulse">
            <Image src="/logo.png" alt="Natural Intellects logo" width={48} height={48} className="w-full h-full object-contain" />
          </div>
          <p className="text-sm text-blue-200/50">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isInitialized || !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0B1F6D' }} role="status" aria-live="polite">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-2xl overflow-hidden animate-pulse">
            <Image src="/logo.png" alt="Natural Intellects logo" width={48} height={48} className="w-full h-full object-contain" />
          </div>
          <p className="text-sm text-blue-200/50">{isInitialized ? 'Taking you to sign in…' : 'Loading...'}</p>
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
        case 'my-reports': return <EmployeeMyReports />
        case 'monthly-reports': return <EmployeeMonthlyReports />
        case 'settings': return <SettingsView />
        default: return <EmployeeSubmitReport />
      }
    }
  }

  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-[#F5F7FA]">
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
              <p className="text-xs text-gray-400">&copy; {new Date().getFullYear()} Operations intelligence for growing organizations. All rights reserved.</p>
              <p className="text-xs text-gray-400 hidden sm:block">Operations intelligence for growing organizations Portal</p>
            </div>
          </footer>
        </div>
      </div>
      <Toaster position="top-right" richColors theme="light" />
    </QueryClientProvider>
  )
}
