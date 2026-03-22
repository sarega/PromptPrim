import React, { useState } from 'react';
import ReactDOM from 'react-dom/client';
import './styles/landing.css';

const navigationItems = [
  { label: 'Why PromptPrim', href: '#why' },
  { label: 'Features', href: '#features' },
  { label: 'Use Cases', href: '#use-cases' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
];

const featureCards = [
  {
    title: 'Structured Prompt Workflows',
    description:
      'Move from quick prompts to repeatable creative systems with reusable stages, briefs, and output lanes.',
  },
  {
    title: 'Memory-Aware Sessions',
    description:
      'Keep project context, narrative constraints, and creative decisions visible across longer production cycles.',
  },
  {
    title: 'Multi-Model Operation',
    description:
      'Route ideation, drafting, editing, and specialist tasks across different models instead of forcing one tool to do everything.',
  },
  {
    title: 'Creator-Focused Workspace',
    description:
      'Designed for writing, production, and iteration workflows where versions, notes, and structure matter.',
  },
  {
    title: 'Hosted Or BYOK Modes',
    description:
      'Start quickly with hosted Pro access or switch to Studio for your own providers, keys, and routing control.',
  },
  {
    title: 'Operational Account Controls',
    description:
      'Built with real SaaS account flows in mind: billing, usage, admin controls, and audit-friendly backend syncing.',
  },
];

const useCases = [
  {
    title: 'Writers And Story Teams',
    description:
      'Develop outlines, scene beats, revisions, and continuity-aware drafts without losing the thread.',
  },
  {
    title: 'Creative Agencies',
    description:
      'Run client-facing ideation, prompt systems, and delivery workflows with cleaner structure than generic chat apps.',
  },
  {
    title: 'Indie Studios',
    description:
      'Coordinate text, image, and video experimentation from one production surface while keeping model choices flexible.',
  },
  {
    title: 'BYOK Power Users',
    description:
      'Bring your own providers, local Ollama endpoint, and routing preferences when you need deeper control.',
  },
];

const betaReasons = [
  {
    title: 'Shape The Workflow Early',
    description:
      'PromptPrim is still in beta, so early users help influence the workflows that become core product behavior.',
  },
  {
    title: 'Start With A Real Product Spine',
    description:
      'This is not a landing-page concept. Core account, billing, and workspace systems are already being tested in the cloud.',
  },
  {
    title: 'Choose Hosted Or Advanced Modes',
    description:
      'Use Pro for a ready-to-run hosted workflow, or step into Studio when you want BYOK control and creator tooling.',
  },
];

const plans = [
  {
    name: 'Free',
    price: '$0',
    cadence: 'trial',
    badge: 'Beta Entry',
    description: 'Trial access for early exploration before you commit to a workflow.',
    features: [
      '$0.20 hosted credit',
      'Expires in 7 days',
      'Preview the product surface',
      'Upgrade path to Pro or Studio',
    ],
    ctaLabel: 'Start Free Trial',
    href: 'auth.html',
    tone: 'subtle',
  },
  {
    name: 'Pro',
    price: '$10',
    cadence: '/ month',
    badge: 'Recommended',
    description: 'The easiest way to start: hosted workflow, no API setup, and room to top up as you grow.',
    features: [
      '$3 monthly hosted credits',
      'No API setup required',
      'Top-up credits available',
      'Optimized writing workflow',
    ],
    ctaLabel: 'Choose Pro',
    href: 'auth.html',
    tone: 'featured',
  },
  {
    name: 'Studio',
    price: '$8',
    cadence: '/ month',
    badge: 'BYOK',
    description: 'Advanced mode for creators who want their own keys, providers, routing, and local tooling.',
    features: [
      'Bring your own API keys',
      'Media Studio tools',
      'Custom provider routing',
      'Local Ollama connector',
    ],
    ctaLabel: 'Choose Studio',
    href: 'auth.html',
    tone: 'secondary',
  },
];

const faqs = [
  {
    question: 'Is PromptPrim just another chatbot?',
    answer:
      'No. PromptPrim is positioned as a creative production workspace with structured workflows, reusable prompt systems, memory-aware context, and multi-model operation.',
  },
  {
    question: 'What do I get on the Free plan?',
    answer:
      'Free is a short beta trial. It includes $0.20 in hosted credit that expires after 7 days so users can evaluate the product before upgrading.',
  },
  {
    question: 'What is the difference between Pro and Studio?',
    answer:
      'Pro is the ready-to-use hosted workflow with $3 monthly credits and optional top-ups. Studio is the advanced BYOK plan with custom providers, Media Studio tools, and local Ollama support.',
  },
  {
    question: 'Do I need my own API keys to use PromptPrim?',
    answer:
      'Only for Studio. Pro is designed for users who want a simpler hosted setup without managing API keys.',
  },
  {
    question: 'Is the product already production-ready?',
    answer:
      'PromptPrim is still in early beta and cloud testing. The goal of this page is to present a credible product direction while the team continues hardening the platform for public rollout.',
  },
];

function LandingPage() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    role: 'Creative team',
    message: '',
  });
  const [contactStatus, setContactStatus] = useState({
    tone: 'idle',
    message: '',
  });
  const [isSubmittingContact, setIsSubmittingContact] = useState(false);

  const baseUrl = import.meta.env.BASE_URL;
  const authUrl = `${baseUrl}auth.html`;
  const logoUrl = `${baseUrl}icon.png`;
  const formspreeEndpoint = typeof import.meta.env.VITE_FORMSPREE_ENDPOINT === 'string'
    ? import.meta.env.VITE_FORMSPREE_ENDPOINT.trim()
    : '';
  const contactEmail = typeof import.meta.env.VITE_CONTACT_EMAIL === 'string'
    ? import.meta.env.VITE_CONTACT_EMAIL.trim()
    : '';
  const year = new Date().getFullYear();

  const closeMenu = () => setIsMenuOpen(false);

  const handleContactFieldChange = (event) => {
    const { name, value } = event.target;
    setContactForm((current) => ({
      ...current,
      [name]: value,
    }));
    if (contactStatus.tone !== 'idle') {
      setContactStatus({
        tone: 'idle',
        message: '',
      });
    }
  };

  const handleContactSubmit = async (event) => {
    event.preventDefault();

    if (isSubmittingContact) {
      return;
    }

    if (!formspreeEndpoint) {
      setContactStatus({
        tone: 'error',
        message: contactEmail
          ? `Contact form is not configured yet. Please email ${contactEmail} directly for now.`
          : 'Contact form is not configured yet. Add VITE_FORMSPREE_ENDPOINT to enable live submissions.',
      });
      return;
    }

    setIsSubmittingContact(true);
    setContactStatus({
      tone: 'pending',
      message: 'Sending your message...',
    });

    try {
      const formData = new FormData();
      formData.append('name', contactForm.name);
      formData.append('email', contactForm.email);
      formData.append('role', contactForm.role);
      formData.append('message', contactForm.message);
      formData.append('source', 'PromptPrim landing page');
      formData.append('page_url', typeof window !== 'undefined' ? window.location.href : 'landing-page');

      const response = await fetch(formspreeEndpoint, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
        },
        body: formData,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const nextMessage = Array.isArray(payload?.errors) && payload.errors.length > 0
          ? payload.errors.map((entry) => entry.message).filter(Boolean).join(' ')
          : 'Your message could not be sent right now. Please try again in a moment.';
        throw new Error(nextMessage);
      }

      setContactForm({
        name: '',
        email: '',
        role: 'Creative team',
        message: '',
      });
      setContactStatus({
        tone: 'success',
        message: 'Thanks. Your message was sent successfully. I will get back to you by email.',
      });
    } catch (error) {
      const fallbackMessage = contactEmail
        ? `Your message could not be sent right now. Please try again or email ${contactEmail} directly.`
        : 'Your message could not be sent right now. Please try again in a moment.';
      setContactStatus({
        tone: 'error',
        message: error instanceof Error && error.message ? error.message : fallbackMessage,
      });
    } finally {
      setIsSubmittingContact(false);
    }
  };

  return (
    <div className="landing-shell">
      <div className="landing-shell__noise" aria-hidden="true" />
      <header className="landing-header">
        <div className="landing-container landing-header__inner">
          <a className="landing-brand" href="#top" onClick={closeMenu}>
            <img className="landing-brand__logo" src={logoUrl} alt="PromptPrim logo" />
            <span className="landing-brand__text">
              <strong>PromptPrim</strong>
              <span>AI creative production workspace</span>
            </span>
          </a>

          <button
            type="button"
            className="landing-menu-toggle"
            aria-expanded={isMenuOpen}
            aria-controls="landing-primary-nav"
            onClick={() => setIsMenuOpen((current) => !current)}
          >
            <span />
            <span />
            <span />
          </button>

          <nav
            id="landing-primary-nav"
            className={`landing-nav${isMenuOpen ? ' is-open' : ''}`}
            aria-label="Primary"
          >
            <div className="landing-nav__links">
              {navigationItems.map((item) => (
                <a key={item.href} href={item.href} onClick={closeMenu}>
                  {item.label}
                </a>
              ))}
            </div>
            <div className="landing-nav__actions">
              <a className="landing-button landing-button--ghost" href={authUrl} onClick={closeMenu}>
                Sign In
              </a>
              <a className="landing-button landing-button--primary" href="#pricing" onClick={closeMenu}>
                Start Beta
              </a>
            </div>
          </nav>
        </div>
      </header>

      <main>
        <section id="top" className="landing-hero">
          <div className="landing-container landing-hero__grid">
            <div className="landing-hero__copy">
              <span className="landing-eyebrow">Private beta / cloud test stage</span>
              <h1>Creative AI production that feels like a workspace, not a chat tab.</h1>
              <p className="landing-hero__summary">
                PromptPrim helps creators run structured prompt workflows, memory-aware sessions,
                and multi-model production from one serious control surface.
              </p>

              <div className="landing-hero__actions">
                <a className="landing-button landing-button--primary" href={authUrl}>
                  Start Free Beta
                </a>
                <a className="landing-button landing-button--secondary" href="#pricing">
                  Explore Plans
                </a>
              </div>

              <div className="landing-proof-grid" aria-label="PromptPrim highlights">
                <article className="landing-proof-card">
                  <strong>Structured Runs</strong>
                  <span>Reusable production flows instead of one-off prompts.</span>
                </article>
                <article className="landing-proof-card">
                  <strong>Memory-Aware</strong>
                  <span>Project context stays visible across longer creative sessions.</span>
                </article>
                <article className="landing-proof-card">
                  <strong>Hosted + BYOK</strong>
                  <span>Choose the simpler hosted route or bring your own stack.</span>
                </article>
              </div>
            </div>

            <div className="landing-hero__visual" aria-hidden="true">
              <div className="workspace-mockup">
                <div className="workspace-mockup__topbar">
                  <div className="workspace-mockup__dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  <div className="workspace-mockup__label">PromptPrim workspace / campaign draft</div>
                  <div className="workspace-mockup__status">Pro routing active</div>
                </div>

                <div className="workspace-mockup__body">
                  <aside className="workspace-mockup__sidebar">
                    <div className="workspace-mockup__sidebar-title">Workflow</div>
                    <ul>
                      <li className="is-active">Brief intake</li>
                      <li>Memory sync</li>
                      <li>Draft routing</li>
                      <li>Editorial pass</li>
                      <li>Delivery pack</li>
                    </ul>
                  </aside>

                  <div className="workspace-mockup__main">
                    <div className="workspace-mockup__hero-card">
                      <span>Current run</span>
                      <strong>Turn campaign brief into a reusable creator workflow</strong>
                      <p>
                        Prompt stack keeps brand constraints, tone, and model routing attached to the
                        project instead of buried in a single thread.
                      </p>
                    </div>

                    <div className="workspace-mockup__stats">
                      <article>
                        <span>Memory state</span>
                        <strong>Project synced</strong>
                      </article>
                      <article>
                        <span>Models online</span>
                        <strong>4 active lanes</strong>
                      </article>
                      <article>
                        <span>Output mode</span>
                        <strong>Writer workflow</strong>
                      </article>
                    </div>

                    <div className="workspace-mockup__streams">
                      <article>
                        <span>Prompt lane</span>
                        <strong>Scene beats + tone constraints</strong>
                      </article>
                      <article>
                        <span>Model route</span>
                        <strong>Ideation {'->'} drafting {'->'} polish</strong>
                      </article>
                      <article>
                        <span>Creator tools</span>
                        <strong>Notes, variants, export-ready outputs</strong>
                      </article>
                    </div>
                  </div>
                </div>
              </div>

              <div className="floating-insight floating-insight--left">
                <span>Memory capsule</span>
                <strong>Characters, constraints, and notes persist with the project.</strong>
              </div>
              <div className="floating-insight floating-insight--right">
                <span>Studio mode</span>
                <strong>Custom providers, Media Studio tools, and local Ollama support.</strong>
              </div>
            </div>
          </div>
        </section>

        <section id="why" className="landing-section">
          <div className="landing-container">
            <div className="section-heading">
              <span className="landing-eyebrow">Why PromptPrim</span>
              <h2>Built for repeatable creative production, not disposable chat history.</h2>
              <p>
                Generic chat tools are useful for quick answers. PromptPrim is aimed at creators and
                teams who need structure, continuity, routing control, and a workspace that can grow
                with real production habits.
              </p>
            </div>

            <div className="comparison-grid">
              <article className="comparison-card comparison-card--muted">
                <span className="comparison-card__label">Generic chat tools</span>
                <ul>
                  <li>One thread holds everything</li>
                  <li>Project context gets buried fast</li>
                  <li>Prompt systems stay manual</li>
                  <li>Model choice is usually shallow</li>
                </ul>
              </article>

              <article className="comparison-card comparison-card--accent">
                <span className="comparison-card__label">PromptPrim</span>
                <ul>
                  <li>Structured prompt workflows with reusable stages</li>
                  <li>Memory-aware workspaces for longer creative arcs</li>
                  <li>Multi-model operation for specialized tasks</li>
                  <li>Creator-focused production surface instead of a blank chat tab</li>
                </ul>
              </article>
            </div>
          </div>
        </section>

        <section id="features" className="landing-section landing-section--tight">
          <div className="landing-container">
            <div className="section-heading">
              <span className="landing-eyebrow">Key Features</span>
              <h2>Six reasons PromptPrim feels like a product, not a prompt experiment.</h2>
            </div>

            <div className="feature-grid">
              {featureCards.map((feature, index) => (
                <article key={feature.title} className="feature-card">
                  <span className="feature-card__index">0{index + 1}</span>
                  <h3>{feature.title}</h3>
                  <p>{feature.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="use-cases" className="landing-section">
          <div className="landing-container">
            <div className="section-heading">
              <span className="landing-eyebrow">Use Cases</span>
              <h2>Designed for creators who need more than a single prompt box.</h2>
            </div>

            <div className="use-case-grid">
              {useCases.map((useCase) => (
                <article key={useCase.title} className="use-case-card">
                  <h3>{useCase.title}</h3>
                  <p>{useCase.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="landing-section landing-section--highlight" id="docs">
          <div className="landing-container">
            <div className="section-heading section-heading--compact">
              <span className="landing-eyebrow">Why Try Now</span>
              <h2>Early users get the most leverage while the product shape is still moving.</h2>
            </div>

            <div className="beta-grid">
              {betaReasons.map((reason) => (
                <article key={reason.title} className="beta-card">
                  <h3>{reason.title}</h3>
                  <p>{reason.description}</p>
                </article>
              ))}
            </div>

            <div className="beta-band">
              <div>
                <span className="beta-band__label">Beta onboarding</span>
                <strong>Documentation, workflow guides, and setup notes are being prepared for cloud testers.</strong>
              </div>
              <a className="landing-button landing-button--secondary" href={authUrl}>
                Join The Beta
              </a>
            </div>
          </div>
        </section>

        <section id="pricing" className="landing-section">
          <div className="landing-container">
            <div className="section-heading">
              <span className="landing-eyebrow">Pricing</span>
              <h2>Simple plans for early cloud testing, with Pro as the easiest starting point.</h2>
              <p>Beta pricing is tuned for evaluation, not enterprise procurement. Pro is the fastest path from trial to real usage.</p>
            </div>

            <div className="pricing-grid">
              {plans.map((plan) => (
                <article
                  key={plan.name}
                  className={`plan-card plan-card--${plan.tone}`}
                >
                  <span className="plan-card__badge">{plan.badge}</span>
                  <h3>{plan.name}</h3>
                  <div className="plan-card__price">
                    <strong>{plan.price}</strong>
                    <span>{plan.cadence}</span>
                  </div>
                  <p className="plan-card__description">{plan.description}</p>
                  <ul className="plan-card__features">
                    {plan.features.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                  <a
                    className={`landing-button ${
                      plan.tone === 'featured' ? 'landing-button--primary' : 'landing-button--secondary'
                    }`}
                    href={`${baseUrl}${plan.href}`}
                  >
                    {plan.ctaLabel}
                  </a>
                </article>
              ))}
            </div>

            <p className="pricing-note">
              Free includes a short hosted trial. Pro includes $3 monthly hosted credits and optional top-ups.
              Studio is BYOK-focused and does not include hosted monthly credits.
            </p>
          </div>
        </section>

        <section id="contact" className="landing-section landing-section--contact">
          <div className="landing-container contact-grid">
            <div className="contact-copy">
              <span className="landing-eyebrow">Contact</span>
              <h2>Interested in the beta, a creator workflow demo, or an investor preview?</h2>
              <p>
                Leave your details and what you want to use PromptPrim for. This form is ready to run
                through Formspree during cloud testing, so early inbound interest can reach you without
                building a custom mail backend first.
              </p>

              {contactEmail ? (
                <p className="contact-copy__direct-email">
                  Prefer direct email? <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
                </p>
              ) : null}

              <div className="contact-copy__notes">
                <article>
                  <span>Best for</span>
                  <strong>Creators, studios, and early product supporters</strong>
                </article>
                <article>
                  <span>Status</span>
                  <strong>Cloud deployment prep and private beta rollout</strong>
                </article>
              </div>
            </div>

            <form className="contact-form" onSubmit={handleContactSubmit}>
              <label>
                <span>Name</span>
                <input
                  name="name"
                  type="text"
                  placeholder="Your name"
                  value={contactForm.name}
                  onChange={handleContactFieldChange}
                  required
                  disabled={isSubmittingContact}
                  autoComplete="name"
                />
              </label>

              <label>
                <span>Email</span>
                <input
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={contactForm.email}
                  onChange={handleContactFieldChange}
                  required
                  disabled={isSubmittingContact}
                  autoComplete="email"
                />
              </label>

              <label>
                <span>Role</span>
                <select
                  name="role"
                  value={contactForm.role}
                  onChange={handleContactFieldChange}
                  disabled={isSubmittingContact}
                >
                  <option>Creative team</option>
                  <option>Agency / studio</option>
                  <option>BYOK power user</option>
                  <option>Investor / advisor</option>
                </select>
              </label>

              <label>
                <span>How do you want to use PromptPrim?</span>
                <textarea
                  name="message"
                  rows="5"
                  placeholder="Tell us about your workflow, models, or creative production needs."
                  value={contactForm.message}
                  onChange={handleContactFieldChange}
                  required
                  disabled={isSubmittingContact}
                />
              </label>

              <button
                type="submit"
                className="landing-button landing-button--primary"
                disabled={isSubmittingContact}
              >
                {isSubmittingContact ? 'Sending...' : 'Request Beta Access'}
              </button>

              {!formspreeEndpoint ? (
                <p className="contact-form__helper">
                  Add <code>VITE_FORMSPREE_ENDPOINT</code> to enable live submissions on this landing page.
                </p>
              ) : null}

              {contactStatus.message ? (
                <p
                  className={`contact-form__status contact-form__status--${contactStatus.tone}`}
                  aria-live="polite"
                >
                  {contactStatus.message}
                </p>
              ) : null}
            </form>
          </div>
        </section>

        <section id="faq" className="landing-section landing-section--faq">
          <div className="landing-container">
            <div className="section-heading">
              <span className="landing-eyebrow">FAQ</span>
              <h2>Questions early users usually ask first.</h2>
            </div>

            <div className="faq-list">
              {faqs.map((faq) => (
                <details key={faq.question} className="faq-item">
                  <summary>{faq.question}</summary>
                  <p>{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-container">
          <div className="footer-grid">
            <div className="footer-brand">
              <a className="landing-brand landing-brand--footer" href="#top">
                <img className="landing-brand__logo" src={logoUrl} alt="PromptPrim logo" />
                <span className="landing-brand__text">
                  <strong>PromptPrim</strong>
                  <span>AI creative production workspace</span>
                </span>
              </a>
              <p>
                Early beta product for structured prompt workflows, memory-aware sessions, and multi-model
                creator production.
              </p>
            </div>

            <div className="footer-links">
              <a href="#docs">Docs</a>
              <a href="#pricing">Pricing</a>
              <a href="#contact">Contact</a>
              <a href="#privacy">Privacy</a>
              <a href="#terms">Terms</a>
            </div>
          </div>

          <div className="footer-note-grid">
            <article id="privacy" className="footer-note-card">
              <span>Privacy</span>
              <p>Essential cookies only for login, security, and core functionality during this beta stage.</p>
            </article>
            <article id="terms" className="footer-note-card">
              <span>Terms</span>
              <p>Beta access, features, and pricing may evolve as PromptPrim moves from cloud testing to broader launch.</p>
            </article>
          </div>

          <div className="footer-bottom">
            <span>{year} PromptPrim. All rights reserved.</span>
            <span>Serious workspace design for early users, partners, and investors.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LandingPage />
  </React.StrictMode>
);
