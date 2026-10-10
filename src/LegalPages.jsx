import { Link } from 'react-router-dom';

function LegalPageLayout({ eyebrow, title, children }) {
  return (
    <section className="section legal-page-shell">
      <div className="container legal-page">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="legal-effective-date">Effective October 10, 2026</p>
        {children}
        <p className="legal-contact">
          Questions? Contact Wakwito Laundry at <a href="mailto:hello@wakwito.co.ke">hello@wakwito.co.ke</a> or +254 700 102 248.
        </p>
        <p><Link to="/checkout">Return to checkout</Link></p>
      </div>
    </section>
  );
}

export function TermsPage() {
  return (
    <LegalPageLayout eyebrow="Customer information" title="Terms and Conditions">
      <p>These terms apply when you use the Wakwito Laundry website or request laundry services. By placing an order, you confirm that the details you provide are accurate and that you have read and accepted these terms.</p>

      <h2>Orders and service approval</h2>
      <p>Submitting an order is a service request, not confirmation that a pickup slot is available. An order is approved when its status changes to “In Progress”; we will show that update in order tracking. We may contact you if we need to confirm your address, items, or schedule.</p>

      <h2>Pricing and payment</h2>
      <p>Checkout displays an estimate based on the services, quantities, and weights entered. If inspection shows that the service or weight differs, we will contact you about any price change before proceeding with the changed work.</p>
      <ul>
        <li><strong>M-Pesa on order:</strong> when configured and selected, an STK Push requests the displayed order total from the Kenyan mobile number entered at checkout. A prompt is a payment request, not proof of payment. The order is marked paid only after payment confirmation.</li>
        <li><strong>Cash on delivery:</strong> pay the displayed order total in cash when the order is delivered.</li>
      </ul>
      <p>Do not share your M-Pesa PIN with Wakwito staff. Enter it only in the official Safaricom prompt on your phone.</p>

      <h2>Pickup, delivery, and care</h2>
      <p>Please provide a reachable phone number, accurate service address, and any relevant garment-care instructions. Pickup windows are scheduling requests; we will contact you if a change is needed. Please identify delicate items and existing stains so we can assess appropriate care.</p>

      <h2>Changes and support</h2>
      <p>To request a change or cancellation, contact us as soon as possible using the contact details below and include your order code. We will explain any service or payment adjustment before making a change. Questions or concerns can be sent to <a href="mailto:hello@wakwito.co.ke">hello@wakwito.co.ke</a>.</p>

      <h2>Website use and updates</h2>
      <p>Use the site lawfully and do not attempt to disrupt or gain unauthorized access to it. We may update these terms when our services or legal requirements change. The effective date above identifies the current version.</p>
    </LegalPageLayout>
  );
}

export function PrivacyPage() {
  return (
    <LegalPageLayout eyebrow="Your information" title="Privacy Policy">
      <p>This policy explains how Wakwito Laundry handles information submitted through this website and during service delivery. We use information to manage laundry orders and customer accounts.</p>

      <h2>Information we collect</h2>
      <p>Depending on how you use the site, we may collect your name, email address, username, phone number, profile photo, service address, optional map pin, order contents, scheduling details, payment status, and messages or instructions you provide.</p>

      <h2>How we use information</h2>
      <ul>
        <li>Create and secure your account and let you update your profile.</li>
        <li>Arrange, perform, and communicate about orders, pickups, delivery, and customer support.</li>
        <li>Calculate order totals, request an M-Pesa payment when selected, and confirm payment status.</li>
        <li>Operate, protect, troubleshoot, and improve the service and meet applicable legal obligations.</li>
      </ul>

      <h2>When information is shared</h2>
      <p>We share only information needed to complete the service: for example, an assigned driver receives the customer's name, phone number, service address, and any map pin relevant to a pickup or delivery. If you select M-Pesa, your phone number and payment amount are sent to Safaricom to request and confirm the payment. Hosting and technical service providers may process data on our behalf. We do not publish your profile or sell your personal information.</p>

      <h2>Storage and security</h2>
      <p>Account and order information is stored in the service database and retained while needed to provide the service, maintain order records, resolve disputes, and meet legal obligations. We use access controls and reasonable safeguards, but no internet transmission or storage system can be guaranteed completely secure.</p>

      <h2>Your choices and requests</h2>
      <p>You can update your account details in the account page. To ask about, correct, or request deletion of personal information, contact <a href="mailto:hello@wakwito.co.ke">hello@wakwito.co.ke</a>. We may retain information that we are required or permitted to keep.</p>

      <h2>Cookies and policy updates</h2>
      <p>The site uses a necessary session cookie when you sign in and browser storage to remember your theme preference and shopping cart. We may update this policy as our practices change; the effective date above identifies the current version.</p>
    </LegalPageLayout>
  );
}
