import { LegalShell, LegalSection, LegalList } from '../legal/legal-shell'

export const metadata = {
  title: 'Terms of Service — NIWMS by Natural Intellects',
  description: 'The terms that govern the use of the NIWMS workforce reporting platform by organizations and their users.',
}

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Legal"
      title="Terms of Service"
      intro="These terms govern the use of the NIWMS workforce reporting platform operated by Natural Intellects Ltd. By creating a workspace, signing in, or using NIWMS on behalf of an organization, you agree to them."
    >
      <LegalSection title="1. The service">
        <p>
          NIWMS lets organizations capture structured daily employee activity, monitor reporting in real time, and turn
          the month into management-ready reports. Features included in each plan are described on the pricing section of
          our website and enforced by the platform&rsquo;s entitlements system.
        </p>
      </LegalSection>

      <LegalSection title="2. Accounts and organizations">
        <LegalList items={[
          <>A workspace is created for one organization. That organization&rsquo;s administrators are responsible for the accounts they create, the roles they assign, and the accuracy of the information they enter.</>,
          <>Keep credentials confidential. Accounts are personal to the user they are issued to; sharing logins across people is not permitted.</>,
          <>You must have authority to bind your organization to these terms if you sign up on its behalf.</>,
          <>Notify us immediately at <a href="mailto:naturalintellectscrop@gmail.com" className="font-semibold text-[#123c36] underline underline-offset-4">naturalintellectscrop@gmail.com</a> if you suspect unauthorized access.</>,
        ]} />
      </LegalSection>

      <LegalSection title="3. Free trial">
        <p>
          New workspaces start with a 14-day free trial of the full feature set. No payment details are required for a
          trial, and nothing is charged automatically when it ends. A trial workspace becomes active by subscribing to a
          plan; if it is not converted, it enters the platform&rsquo;s normal lifecycle handling and its data may
          eventually be removed.
        </p>
      </LegalSection>

      <LegalSection title="4. Plans, billing and VAT">
        <LegalList items={[
          <>Plans are priced in Ugandan Shillings (UGX) per month, with the employee ceiling shown for each plan: Starter (up to 10), Business (up to 30), Professional (up to 75) and Enterprise (custom, 75+).</>,
          <>Billing intervals are monthly, quarterly (−5%) or annual (−10%). The exact amount for every period — including the 18% VAT charge, the covered dates and the renewal date — is computed by our billing engine and shown before you are invoiced.</>,
          <>Fees are due for each upcoming billing period. Plan changes take effect through the workspace billing screen and are prorated by the same engine.</>,
          <>Prices exclude VAT unless a quote states otherwise; VAT is added at billing time.</>,
        ]} />
      </LegalSection>

      <LegalSection title="5. Acceptable use">
        <p>You agree not to:</p>
        <LegalList items={[
          <>use the service for unlawful purposes or to record activity your employees have not been informed about;</>,
          <>attempt to access other organizations&rsquo; workspaces, probe or breach platform security, or bypass role and tenant restrictions;</>,
          <>reverse engineer the service except where such restriction is prohibited by law;</>,
          <>resell, sublicense or provide the service to third parties as a competing offering without written agreement;</>,
          <>upload malicious code or content that infringes others&rsquo; rights.</>,
        ]} />
      </LegalSection>

      <LegalSection title="6. Your data and content">
        <p>
          Your organization owns the content it creates in NIWMS — reports, categories, employee records and exports. You
          grant us the limited right to host, process and back up that content solely to operate and support the service
          for you. We may produce aggregated, de-identified statistics to operate and improve the platform, but we do not
          sell workspace data.
        </p>
      </LegalSection>

      <LegalSection title="7. Intellectual property">
        <p>
          The NIWMS platform — software, design, brand and documentation — is owned by Natural Intellects Ltd and
          protected by intellectual property law. Except for the rights expressly granted in these terms, nothing
          transfers to you.
        </p>
      </LegalSection>

      <LegalSection title="8. Availability and changes">
        <p>
          We work to keep NIWMS available and reliable, and we ship improvements continuously. Scheduled maintenance and
          occasional incidents happen; we do not promise uninterrupted service beyond what consumer protection law
          requires. We may modify or discontinue non-core features with reasonable notice to administrators.
        </p>
      </LegalSection>

      <LegalSection title="9. Suspension and termination">
        <LegalList items={[
          <>Administrators can end a subscription from the workspace billing screen; access continues to the end of the paid period unless you ask us to close it sooner.</>,
          <>We may suspend a workspace that breaches these terms, is used unlawfully, or endangers the platform or other customers — with notice where practical.</>,
          <>After termination, we follow the retention and deletion process described in the Privacy Policy.</>,
        ]} />
      </LegalSection>

      <LegalSection title="10. Disclaimers and liability">
        <p>
          To the maximum extent permitted by law, the service is provided &ldquo;as is&rdquo; and &ldquo;as
          available&rdquo;, and Natural Intellects Ltd is not liable for indirect or consequential losses. Our total
          liability for claims relating to the service is limited to the amounts your organization paid us in the twelve
          months before the claim. Nothing in these terms excludes liability that cannot lawfully be excluded.
        </p>
      </LegalSection>

      <LegalSection title="11. Governing law">
        <p>
          These terms are governed by the laws of Uganda, and the courts of Uganda have exclusive jurisdiction over
          disputes, without limiting mandatory consumer protections in your jurisdiction.
        </p>
      </LegalSection>

      <LegalSection title="12. Changes to these terms">
        <p>
          We may update these terms as the product or the law changes. Material changes will be communicated to
          organization administrators in advance; continuing to use NIWMS after that constitutes acceptance.
        </p>
      </LegalSection>
    </LegalShell>
  )
}
