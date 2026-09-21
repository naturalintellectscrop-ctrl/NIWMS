import { LegalShell, LegalSection, LegalList } from '../legal/legal-shell'

export const metadata = {
  title: 'Privacy Policy — NIWMS by Natural Intellects',
  description: 'How NIWMS collects, uses, stores and protects information for the organizations and employees that use the platform.',
}

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Privacy Policy"
      intro="This policy explains what information NIWMS collects, why we collect it, how it is protected, and the choices your organization has. It applies to the NIWMS workforce reporting platform operated by Natural Intellects Ltd."
    >
      <LegalSection title="1. Who we are">
        <p>
          NIWMS is a workforce reporting platform built and operated by <strong>Natural Intellects Ltd</strong>, a company
          based in Uganda (&ldquo;we&rdquo;, &ldquo;us&rdquo;). Organizations subscribe to NIWMS to capture daily employee
          activity, monitor reporting, and produce monthly management reports.
        </p>
        <p>
          For the data that your organization stores in NIWMS — including employee accounts and daily activity reports —
          your organization&rsquo;s administrators decide what is collected and who can access it. We process that data on
          your organization&rsquo;s behalf to provide the service. You can reach us at{' '}
          <a href="mailto:naturalintellectscrop@gmail.com" className="font-semibold text-[#123c36] underline underline-offset-4">naturalintellectscrop@gmail.com</a>.
        </p>
      </LegalSection>

      <LegalSection title="2. Information we collect">
        <LegalList items={[
          <> <strong>Organization account data</strong> — organization name, workspace identifier, industry, plan, billing contact details and subscription status supplied during signup or trial approval.</>,
          <> <strong>User account data</strong> — the username, name, role and password hash for each account your organization creates. Passwords are stored only as bcrypt hashes and are never visible to us in plain text.</>,
          <> <strong>Workforce reporting content</strong> — the daily activity reports, categories, voice-note transcriptions, monthly reports, achievements and statistics that employees and administrators create in the workspace.</>,
          <> <strong>Communication data</strong> — contact email addresses used for trial requests, invitations, password resets and billing; email delivery records kept for reliability auditing.</>,
          <> <strong>Security and audit data</strong> — sign-in events, administrative actions, report lifecycle events and other audit records used to keep workspaces secure and accountable.</>,
        ]} />
      </LegalSection>

      <LegalSection title="3. How we use information">
        <LegalList items={[
          <>Provide, operate and secure the NIWMS service for your organization.</>,
          <>Generate the daily and monthly reporting features your organization relies on.</>,
          <>Send service email — invitations, password resets, reminders and billing notices — through the delivery provider your configuration selects.</>,
          <>Handle billing for paid plans and manage trials.</>,
          <>Detect and prevent abuse, unauthorized access and security incidents.</>,
        ]} />
        <p>We do not sell personal information, and we do not use your organization&rsquo;s workforce content for advertising.</p>
      </LegalSection>

      <LegalSection title="4. Employee data is your organization's responsibility">
        <p>
          NIWMS is a business tool: the subscribing organization enters its employees&rsquo; details and determines what
          activity is recorded. Administrators should inform employees about what the workspace captures and use NIWMS
          features — such as departments, positions and retention controls — in line with their own obligations to their
          staff. As the platform operator we access workspace content only to operate, support and secure the service.
        </p>
      </LegalSection>

      <LegalSection title="5. Cookies and sessions">
        <p>
          NIWMS keeps you signed in with a single session cookie (<code className="rounded bg-[#f4f6f8] px-1.5 py-0.5 font-mono text-xs">ni_session</code>) that is HttpOnly
          and scoped to the service. We do not use third-party advertising or cross-site tracking cookies.
        </p>
      </LegalSection>

      <LegalSection title="6. Storage and security">
        <LegalList items={[
          <>Data is stored in a managed PostgreSQL database (currently hosted on Supabase) with encryption in transit.</>,
          <>Passwords are hashed with bcrypt; sessions are HttpOnly, signed and can be revoked server-side.</>,
          <>Workspaces are tenant-isolated: organization data is filtered by membership on every request, and administrative endpoints verify roles server-side.</>,
          <>Administrative actions and report lifecycle events are recorded in audit logs.</>,
          <>Sign-in is protected by failed-attempt lockout, and platform access is limited to Natural Intellects administrators.</>,
        ]} />
        <p>No system is perfectly secure; we investigate and contain incidents promptly and will notify affected organizations as required by applicable law.</p>
      </LegalSection>

      <LegalSection title="7. Retention and deletion">
        <p>
          Workspace owners control their data lifecycle from within NIWMS: organization settings expose retention rules,
          and account deletion follows a structured request process before data is permanently removed. Billing and audit
          records may be retained where needed for legal, tax or security obligations. Trial workspaces that are not
          converted may be removed after their lifecycle ends.
        </p>
      </LegalSection>

      <LegalSection title="8. Sharing with service providers">
        <p>
          We share data only with providers that help us run NIWMS — currently database hosting (Supabase) and, when email
          delivery is enabled, the configured email provider. These providers process data solely to deliver the service.
          We may disclose information where required by law or to protect the rights, property and safety of Natural
          Intellects, our customers or the public.
        </p>
      </LegalSection>

      <LegalSection title="9. Your choices and rights">
        <LegalList items={[
          <>Administrators can access, correct, export and delete workspace data through NIWMS tooling, including Excel exports of reports.</>,
          <>Employees can contact their organization&rsquo;s administrators to correct their account details.</>,
          <>Anyone may contact us to ask what data we hold about them or to request deletion, subject to legal retention duties.</>,
        ]} />
      </LegalSection>

      <LegalSection title="10. Changes to this policy">
        <p>
          We may update this policy as the service evolves. Material changes will be announced on the platform or by email
          to organization administrators before they take effect.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
