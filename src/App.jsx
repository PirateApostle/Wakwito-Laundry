import React, { useEffect, useState } from 'react';
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { getOrders, updateOrderStatus } from './api';
import { OrderCreationPage, CheckoutPage, OrderTrackingPage } from './OrderExperience';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  CheckCircle2,
  Clock3,
  CreditCard,
  Droplets,
  House,
  Menu,
  PackageCheck,
  Phone,
  ShieldCheck,
  Shirt,
  Sparkles,
  Star,
  Store,
  Truck,
  UserCircle2,
  Users,
  WashingMachine,
  X,
} from 'lucide-react';

const services = [
  { icon: WashingMachine, name: 'Washing', description: 'Premium wash care for everyday fabrics and essentials.', accent: 'cyan' },
  { icon: Shirt, name: 'Dry Cleaning', description: 'Gentle treatment for delicate garments, suits, and formal wear.', accent: 'blue' },
  { icon: Sparkles, name: 'Ironing', description: 'Perfect finishing with crisp folds and wrinkle-free results.', accent: 'amber' },
  { icon: Droplets, name: 'Duvet Cleaning', description: 'Fresh, hygienic duvet care for cleaner sleep comfort.', accent: 'indigo' },
  { icon: Store, name: 'Curtain Cleaning', description: 'Revive curtains with deep cleaning for brighter indoor spaces.', accent: 'purple' },
  { icon: ShieldCheck, name: 'Carpet Cleaning', description: 'Restore softness and freshness to your carpeted rooms.', accent: 'emerald' },
];

const notifications = [
  'Your bed linens are washed and drying now.',
  'Driver assigned for tomorrow’s delivery window.',
  '10% loyalty discount unlocked on your next order.',
];

const COLORS = ['#18a0fb', '#6b7cff', '#f2b448', '#3cc9a6', '#9b7bff'];

const reviews = [
  { name: 'Grace M.', quote: 'Super fast pickup and professional folding. My family’s linens have never looked better.', rating: 5 },
  { name: 'Brian O.', quote: 'The dry cleaning finish is excellent and the delivery communication is top-tier.', rating: 5 },
  { name: 'Jane W.', quote: 'A reliable laundry service that feels premium from booking to final delivery.', rating: 5 },
];

const faqs = [
  { q: 'How does pickup and delivery work?', a: 'You can schedule pickup, delivery, or both from the checkout flow. A driver confirms the time and keeps you updated in real time.' },
  { q: 'What is the pricing model?', a: 'Laundry is priced at KSh 99 per kilogram, with clear service add-ons for dry cleaning, ironing, and special garment care.' },
  { q: 'Do you handle delicate items?', a: 'Yes. Our dry cleaning and fabric handling process is designed for suits, curtains, duvet sets, and sensitive materials.' },
  { q: 'Can I pay using M-Pesa?', a: 'Absolutely. We accept M-Pesa and cash for both in-store and delivery orders, depending on the fulfillment option chosen.' },
];

const routeAssignments = [
  { id: 'DR-214', route: 'Westlands', status: 'On the way', eta: '12 mins', weight: '18kg' },
  { id: 'DR-218', route: 'Kilimani', status: 'Loading', eta: '30 mins', weight: '11kg' },
  { id: 'DR-226', route: 'CBD', status: 'Delivered', eta: 'Completed', weight: '7kg' },
];

function ProtectedRoute({ allowedRoles, children }) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="container auth-loading">Checking your session…</div>;
  }
  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to={user.role === 'ADMIN' ? '/admin' : user.role === 'DRIVER' ? '/driver' : '/dashboard'} replace />;
  }

  return children;
}

function AppLayout() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [themePreference, setThemePreference] = useState(() => {
    const savedPreference = localStorage.getItem('wakwito-theme');
    return ['light', 'dark', 'system'].includes(savedPreference) ? savedPreference : 'system';
  });
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const location = useLocation();
  const resolvedTheme = themePreference === 'system'
    ? (systemPrefersDark ? 'dark' : 'light')
    : themePreference;

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname, location.hash]);

  useEffect(() => {
    const sectionId = decodeURIComponent(location.hash.slice(1));
    const frame = window.requestAnimationFrame(() => {
      if (sectionId) {
        document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (location.pathname === '/') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [location.pathname, location.hash, location.key]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handlePreferenceChange = (event) => setSystemPrefersDark(event.matches);

    setSystemPrefersDark(mediaQuery.matches);
    mediaQuery.addEventListener('change', handlePreferenceChange);
    return () => mediaQuery.removeEventListener('change', handlePreferenceChange);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme);
    document.documentElement.setAttribute('data-theme-preference', themePreference);
    localStorage.setItem('wakwito-theme', themePreference);
  }, [resolvedTheme, themePreference]);

  const navItems = [
    { label: 'Home', to: '/' },
    { label: 'Services', to: '/#services' },
    { label: 'Pricing', to: '/#pricing' },
    { label: 'Reviews', to: '/#reviews' },
    { label: 'FAQ', to: '/#faq' },
  ];

  return (
    <>
      <header className="topbar">
        <div className="container nav-wrap">
          <Link to="/" className="brand" aria-label="Wakwito Laundry home">
            <span className="brand-mark">W</span>
            <span>
              <strong>Wakwito</strong>
              <small>Laundry</small>
            </span>
          </Link>

          <nav className={`nav ${menuOpen ? 'open' : ''}`} aria-label="Main navigation">
            {navItems.map((item) => (
              <Link key={item.to} to={item.to} className="nav-link">
                {item.label}
              </Link>
            ))}

            {user ? (
              <>
                <NavLink to={user.role === 'ADMIN' ? '/admin' : user.role === 'DRIVER' ? '/driver' : '/dashboard'} className="nav-link">
                  Dashboard
                </NavLink>
                <NavLink to="/new-order" className="nav-link">
                  New Order
                </NavLink>
                <NavLink to="/order-tracking" className="nav-link">
                  Tracking
                </NavLink>
                <NavLink to="/account" className="nav-link">
                  Account
                </NavLink>
                <button type="button" className="button ghost-button small-button" onClick={() => logout().catch(console.error)}>
                  Log out
                </button>
              </>
            ) : (
              <Link to="/signin" className="button primary-button small-button">
                Sign in
              </Link>
            )}
          </nav>

          <div className="nav-actions">
            <label className="theme-control">
              <span aria-hidden="true">{resolvedTheme === 'dark' ? '🌙' : '☀️'}</span>
              <select
                className="theme-select"
                aria-label="Color theme"
                title={`Color theme: ${themePreference}`}
                value={themePreference}
                onChange={(event) => setThemePreference(event.target.value)}
              >
                <option value="system">System</option>
                <option value="light">Light</option>
                <option value="dark">Dark</option>
              </select>
            </label>
            <button
              type="button"
              className="menu-button"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              onClick={() => setMenuOpen((prev) => !prev)}
            >
              {menuOpen ? <X size={22} /> : <Menu size={22} />}
            </button>
          </div>
        </div>
      </header>

      <main className="page-shell">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/signin" element={<SignInPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route
            path="/account"
            element={
              <ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN', 'DRIVER']}>
                <AccountPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute allowedRoles={['CUSTOMER']}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/new-order"
            element={
              <ProtectedRoute allowedRoles={['CUSTOMER']}>
                <OrderCreationPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/checkout"
            element={
              <ProtectedRoute allowedRoles={['CUSTOMER']}>
                <CheckoutPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/order-tracking"
            element={
              <ProtectedRoute allowedRoles={['CUSTOMER', 'ADMIN', 'DRIVER']}>
                <OrderTrackingPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['ADMIN']}>
                <AdminPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/driver"
            element={
              <ProtectedRoute allowedRoles={['DRIVER']}>
                <DriverPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <Footer />
    </>
  );
}

function AccountPage() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState({
    name: user?.name || '',
    username: user?.username || '',
    phone: user?.phone || '',
    location: user?.location || '',
    profilePhoto: user?.profilePhoto || null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setForm({
      name: user?.name || '',
      username: user?.username || '',
      phone: user?.phone || '',
      location: user?.location || '',
      profilePhoto: user?.profilePhoto || null,
    });
  }, [user]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setSaved(false);
  };

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPEG, or WebP profile photo.');
      return;
    }
    if (file.size > 512 * 1024) {
      setError('Profile photos must be 512 KB or smaller.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setForm((current) => ({ ...current, profilePhoto: reader.result }));
      setError('');
      setSaved(false);
    };
    reader.onerror = () => setError('Unable to read this photo. Please choose another file.');
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      await updateProfile(form);
      setSaved(true);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="auth-shell">
      <div className="container auth-panel single-form">
        <form className="form-card wider account-form" onSubmit={handleSubmit}>
          <span className="eyebrow">Your account</span>
          <h2>Profile details</h2>
          <div className="account-photo-editor">
            {form.profilePhoto ? (
              <img src={form.profilePhoto} alt="Profile preview" className="account-photo-preview" />
            ) : (
              <div className="account-photo-preview account-photo-placeholder" aria-hidden="true">
                <UserCircle2 size={40} />
              </div>
            )}
            <div>
              <label className="button secondary-button account-photo-label">
                Change photo
                <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handlePhotoChange} />
              </label>
              <p className="muted-text">PNG, JPEG, or WebP. Maximum 512 KB.</p>
              {form.profilePhoto ? (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setForm((current) => ({ ...current, profilePhoto: null }));
                    setSaved(false);
                  }}
                >
                  Remove photo
                </button>
              ) : null}
            </div>
          </div>

          <div className="two-col">
            <label>
              Full name
              <input name="name" value={form.name} onChange={handleChange} maxLength={100} required />
            </label>
            <label>
              Username
              <input
                name="username"
                value={form.username}
                onChange={handleChange}
                minLength={3}
                maxLength={24}
                pattern="[A-Za-z0-9_]{3,24}"
                autoCapitalize="none"
                required
              />
              <small>3–24 letters, numbers, or underscores.</small>
            </label>
          </div>

          <div className="two-col">
            <label>
              Phone number
              <input name="phone" type="tel" value={form.phone} onChange={handleChange} maxLength={20} required />
            </label>
            <label>
              Location
              <input
                name="location"
                value={form.location}
                onChange={handleChange}
                maxLength={240}
                placeholder="Area, estate, or neighborhood"
              />
            </label>
          </div>

          <label>
            Email address
            <input type="email" value={user?.email || ''} readOnly />
            <small>Email changes are not available here.</small>
          </label>

          {error ? <p className="error-text" role="alert">{error}</p> : null}
          {saved ? <p className="success-text" role="status">Your account details have been updated.</p> : null}
          <button type="submit" className="button primary-button full-width" disabled={saving}>
            {saving ? 'Saving profile…' : 'Save changes'}
          </button>
        </form>
      </div>
    </section>
  );
}

function HomePage() {
  return (
    <>
      <section className="hero-section">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Premium laundry operations</span>
            <h1>Clean Clothes. Fresh Life.</h1>
            <p>
              Wakwito Laundry offers trusted washing, ironing, dry cleaning, and home care services across Nairobi with pickup, delivery, and seamless digital booking.
            </p>
            <div className="hero-actions">
              <Link to="/signin" className="button primary-button">
                Place an Order <ArrowRight size={18} />
              </Link>
              <a href="#services" className="button secondary-button">
                Explore Services
              </a>
            </div>
            <div className="hero-metrics">
              <div>
                <strong>4.9/5</strong>
                <span>Customer rating</span>
              </div>
              <div>
                <strong>2.4k+</strong>
                <span>Orders cleaned</span>
              </div>
              <div>
                <strong>45 min</strong>
                <span>Average turnaround</span>
              </div>
            </div>
          </div>

          <div className="hero-visual" aria-label="Laundry services illustration">
            <div className="image-card large-card">
              <div className="service-chip">
                <Sparkles size={18} />
                24/7 service
              </div>
            </div>
            <div className="image-card small-card">
              <div className="mini-stat">
                <PackageCheck size={20} />
                <div>
                  <strong>112</strong>
                  <span>Fresh deliveries today</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="company-strip">
        <div className="container trust-grid">
          <div><BadgeCheck /> Trusted by 3,500+ Nairobi homes</div>
          <div><Truck /> Pickup and doorstep delivery</div>
          <div><CreditCard /> M-Pesa and cash payment support</div>
        </div>
      </section>

      <section className="section" id="about">
        <div className="container split-section">
          <div className="section-copy">
            <span className="eyebrow">About Wakwito Laundry</span>
            <h2>Professional care for busy homes and growing businesses.</h2>
            <p>
              We combine efficient machines, skilled handling, and a customer-first service model to keep every order fresh, clean, and on time.
            </p>
            <ul className="feature-list">
              <li><CheckCircle2 size={18} /> Quality-tested washing and drying cycles.</li>
              <li><CheckCircle2 size={18} /> Expert garment care for curtains, carpets, and duvet sets.</li>
              <li><CheckCircle2 size={18} /> Reliable Nairobi-wide pickup and delivery scheduling.</li>
            </ul>
          </div>
          <div className="info-panel">
            <div className="info-panel-card card-accent">
              <Users size={20} />
              <strong>500+ active households</strong>
              <span>Using our recurring garment care plans</span>
            </div>
            <div className="info-panel-card">
              <Clock3 size={20} />
              <strong>Same-day support</strong>
              <span>Available across Nairobi and nearby estates</span>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt-section" id="services">
        <div className="container">
          <div className="section-heading center-heading">
            <span className="eyebrow">Our services</span>
            <h2>Complete laundry solutions for every routine.</h2>
          </div>
          <div className="service-grid">
            {services.map(({ icon: Icon, name, description, accent }) => (
              <article key={name} className={`service-card ${accent}`}>
                <div className="icon-wrap">
                  <Icon size={22} />
                </div>
                <h3>{name}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading center-heading">
            <span className="eyebrow">How it works</span>
            <h2>Simple steps, spotless results.</h2>
          </div>
          <div className="steps-grid">
            {[
              ['Book', 'Choose pickup or drop-off and schedule your service.'],
              ['We clean', 'Our team washes, dries, and presses with checked quality control.'],
              ['Delivered', 'Receive clean items on time, with status updates through the app.'],
            ].map(([title, text], index) => (
              <div key={title} className="step-card">
                <span className="step-number">0{index + 1}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt-section">
        <div className="container">
          <div className="section-heading center-heading">
            <span className="eyebrow">Why choose us</span>
            <h2>Built for trust, speed, and convenience.</h2>
          </div>
          <div className="benefit-grid">
            {[
              ['Technology-driven booking', 'Smart scheduling, order tracking, and digital checkouts built for speed.'],
              ['Flexible fulfillment', 'Pickup, drop-off, delivery, and pickup-plus-delivery to fit your plan.'],
              ['Quality assurance', 'Consistent fabric care and finish checks before every delivery.'],
            ].map(([title, text]) => (
              <div key={title} className="benefit-card">
                <ShieldCheck size={22} />
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="container">
          <div className="section-heading center-heading">
            <span className="eyebrow">Simple pricing</span>
            <h2>Transparent rates with no hidden surprises.</h2>
          </div>

          <div className="pricing-card">
            <div className="pricing-main">
              <span className="price-tag">KSh 99</span>
              <span className="price-label">per kilogram</span>
            </div>
            <div className="pricing-details">
              <div>
                <strong>Washing</strong>
                <span>Standard garments & home textiles</span>
              </div>
              <div>
                <strong>Dry cleaning</strong>
                <span>Formal wear and delicate fabrics</span>
              </div>
              <div>
                <strong>Delivery</strong>
                <span>Effortless doorstep fulfillment</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section alt-section">
        <div className="container split-section">
          <div className="section-copy">
            <span className="eyebrow">Pickup & delivery</span>
            <h2>Faster routines, smoother service.</h2>
            <p>
              Choose customer drop-off or enjoy our scheduled collection and return service. Every order is tracked until final delivery.
            </p>
          </div>
          <div className="delivery-panel">
            <div className="delivery-item">
              <House size={20} />
              <div>
                <strong>Pickup</strong>
                <span>Schedule convenient collection windows</span>
              </div>
            </div>
            <div className="delivery-item">
              <Truck size={20} />
              <div>
                <strong>Delivery</strong>
                <span>Fast return to your doorstep or office</span>
              </div>
            </div>
            <div className="delivery-item">
              <Phone size={20} />
              <div>
                <strong>Support</strong>
                <span>Real-time updates from our operations team</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="reviews">
        <div className="container">
          <div className="section-heading center-heading">
            <span className="eyebrow">Customer reviews</span>
            <h2>Families and offices keep coming back.</h2>
          </div>
          <div className="reviews-grid">
            {reviews.map(({ name, quote, rating }) => (
              <article key={name} className="review-card">
                <div className="stars">{Array.from({ length: rating }).map((_, index) => <Star key={`${name}-${index}`} size={14} fill="currentColor" />)}</div>
                <p>“{quote}”</p>
                <strong>{name}</strong>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section alt-section" id="faq">
        <div className="container faq-wrap">
          <div className="section-heading">
            <span className="eyebrow">FAQ</span>
            <h2>Common questions from customers.</h2>
          </div>
          <div className="faq-list">
            {faqs.map(({ q, a }) => (
              <details key={q} open={q === 'How does pickup and delivery work?'}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="cta-section">
        <div className="container cta-box">
          <div>
            <span className="eyebrow">Let’s get your clothes fresh again</span>
            <h2>Ready for cleaner, easier laundry days?</h2>
          </div>
          <Link to="/signin" className="button primary-button">
            Book with Wakwito <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </>
  );
}

function SignInPage() {
  const navigate = useNavigate();
  const { login, user, loading } = useAuth();
  const [form, setForm] = useState(() => import.meta.env.DEV
    ? { identifier: 'mainoo@wakwito.co.ke', password: 'demo123' }
    : { identifier: '', password: '' });
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      if (user.role === 'ADMIN') navigate('/admin');
      else if (user.role === 'DRIVER') navigate('/driver');
      else navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    try {
      await login(form.identifier, form.password, remember);
      setError('');
    } catch (loginError) {
      setError(loginError.message);
    }
  };

  return (
    <section className="auth-shell">
      <div className="container auth-panel">
        <div className="auth-copy">
          <span className="eyebrow">Welcome back</span>
          <h1>Sign in to manage your orders.</h1>
          <p>
            Track laundry activity, review delivery timelines, and manage booking preferences from one secure dashboard.
          </p>
          {import.meta.env.DEV ? (
            <div className="credentials-box">
              <strong>Local demo accounts</strong>
              <ul>
                <li>Customer: mainoo@wakwito.co.ke / demo123</li>
                <li>Admin: admin@wakwito.co.ke / admin123</li>
                <li>Driver: driver@wakwito.co.ke / driver123</li>
              </ul>
            </div>
          ) : null}
        </div>

        <form className="form-card" onSubmit={handleSubmit}>
          <h2>Sign In</h2>
          <label>
            Email / Phone / Username
            <input name="identifier" type="text" value={form.identifier} onChange={handleChange} placeholder="Email, phone, or username" />
          </label>

          <label>
            Password
            <input name="password" type="password" value={form.password} onChange={handleChange} placeholder="••••••••" />
          </label>

          <div className="inline-row form-meta">
            <label className="checkbox-row">
              <input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} />
              Remember me
            </label>
            <a href="#">Forgot password?</a>
          </div>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" className="button primary-button full-width" disabled={loading}>
            {loading ? 'Checking session…' : 'Sign In'}
          </button>

          <Link to="/signup" className="button secondary-button full-width">
            Create Account
          </Link>
        </form>
      </div>
    </section>
  );
}

function SignUpPage() {
  const navigate = useNavigate();
  const { signup, user } = useAuth();
  const [form, setForm] = useState({
    name: 'Mary Njeri',
    email: 'mary@example.com',
    phone: '0711223344',
    password: 'welcome123',
    confirmPassword: 'welcome123',
  });
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) navigate('/dashboard');
  }, [user, navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.name || !form.email || !form.phone) {
      setError('Please complete all required account details.');
      return;
    }

    if (form.password.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      await signup(form);
      setError('');
    } catch (signupError) {
      setError(signupError.message);
    }
  };

  return (
    <section className="auth-shell">
      <div className="container auth-panel single-form">
        <form className="form-card wider" onSubmit={handleSubmit}>
          <h2>Create Account</h2>
          <div className="two-col">
            <label>
              Full Name
              <input name="name" type="text" value={form.name} onChange={handleChange} />
            </label>
            <label>
              Email
              <input name="email" type="email" value={form.email} onChange={handleChange} />
            </label>
          </div>

          <div className="two-col">
            <label>
              Phone Number
              <input name="phone" type="tel" value={form.phone} onChange={handleChange} />
            </label>
            <label>
              Password
              <input name="password" type="password" value={form.password} onChange={handleChange} />
            </label>
          </div>

          <label>
            Confirm Password
            <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} />
          </label>

          {error ? <p className="error-text">{error}</p> : null}

          <button type="submit" className="button primary-button full-width">
            Create Account
          </button>

          <p className="auth-switch">
            Already have an account? <Link to="/signin">Sign in</Link>
          </p>
        </form>
      </div>
    </section>
  );
}

function DashboardPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState('');

  useEffect(() => {
    let active = true;
    getOrders()
      .then((result) => {
        if (active) setOrders(result);
      })
      .catch((error) => {
        if (active) setOrdersError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const completedOrders = orders.filter((order) => order.status === 'Completed').length;
  const pendingOrders = orders.filter((order) => order.status === 'Pending').length;
  const activeOrders = orders.length - completedOrders;
  const amountSpent = orders.reduce((sum, order) => sum + order.total, 0);
  const currentMonth = new Date();
  const chartData = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 5 + index, 1);
    const monthOrders = orders.filter((order) => {
      const createdAt = new Date(order.createdAt);
      return createdAt.getFullYear() === month.getFullYear() && createdAt.getMonth() === month.getMonth();
    });
    return {
      name: month.toLocaleString(undefined, { month: 'short' }),
      expenditure: monthOrders.reduce((sum, order) => sum + order.total, 0),
    };
  });
  const serviceValues = orders.reduce((result, order) => {
    for (const item of order.items) {
      result[item.name] = (result[item.name] || 0) + item.price;
    }
    return result;
  }, {});
  const serviceBreakdown = Object.entries(serviceValues).map(([name, value]) => ({ name, value }));
  const dashboardStats = [
    { label: 'Current active orders', value: String(activeOrders).padStart(2, '0'), tone: 'blue' },
    { label: 'Pending orders', value: String(pendingOrders).padStart(2, '0'), tone: 'amber' },
    { label: 'Completed orders', value: String(completedOrders).padStart(2, '0'), tone: 'green' },
    { label: 'Total amount spent', value: `KSh ${amountSpent.toLocaleString()}`, tone: 'purple' },
  ];

  return (
    <section className="section dashboard-shell">
      <div className="container dashboard-grid">
        <aside className="sidebar-panel">
          <div className="profile-header">
            <div className="avatar-circle">
              {user?.profilePhoto ? (
                <img src={user.profilePhoto} alt="" className="avatar-image" />
              ) : (
                <UserCircle2 size={28} />
              )}
            </div>
            <div>
              <span>Customer account</span>
              <strong>{user?.name || 'Mainoo Kibet'}</strong>
              {user?.username ? <span>@{user.username}</span> : null}
            </div>
          </div>

          <div className="side-block">
            <h3>Quick actions</h3>
            <Link to="/account" className="button secondary-button full-width">Edit account details</Link>
            <Link to="/new-order" className="button primary-button full-width">Place New Order</Link>
            <Link to="/order-tracking" className="button secondary-button full-width">View service history</Link>
          </div>

          <div className="side-block">
            <h3>Notifications</h3>
            <ul className="notification-list">
              {notifications.map((note) => (
                <li key={note}><Bell size={14} /> {note}</li>
              ))}
            </ul>
          </div>
        </aside>

        <div className="content-panel">
          <div className="dashboard-header">
            <div>
              <span className="eyebrow">Customer dashboard</span>
              <h1>Welcome, {user?.name?.split(' ')[0] || 'Mainoo'} 👋</h1>
            </div>
            <Link to="/new-order" className="button primary-button">Place New Order</Link>
          </div>

          <div className="stats-grid">
            {dashboardStats.map((item) => (
              <div key={item.label} className={`stat-card ${item.tone}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div className="chart-grid">
            <div className="panel-card chart-card large-chart">
              <div className="panel-header">
                <h3>Monthly expenditure</h3>
                <span>Last 6 months</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="expenditureFill" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="5%" stopColor="var(--chart-accent)" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="var(--chart-accent)" stopOpacity={0.08} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-label)', fontSize: 12 }} tickFormatter={(value) => `KSh ${value / 1000}k`} />
                  <Tooltip
                    formatter={(value) => [`KSh ${Number(value).toLocaleString()}`, 'Expenditure']}
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-grid)', borderRadius: 12, color: 'var(--chart-text)', boxShadow: 'var(--shadow-soft)' }}
                    labelStyle={{ color: 'var(--chart-text)', fontWeight: 700 }}
                    itemStyle={{ color: 'var(--chart-accent)' }}
                    cursor={{ fill: 'var(--chart-cursor)' }}
                  />
                  <Area type="monotone" dataKey="expenditure" stroke="var(--chart-accent)" strokeWidth={3} fill="url(#expenditureFill)" activeDot={{ r: 5, fill: 'var(--chart-accent)', stroke: 'var(--chart-tooltip-bg)', strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="panel-card chart-card">
              <div className="panel-header">
                <h3>Order mix</h3>
                <span>Service share</span>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={serviceBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={78} paddingAngle={2}>
                    {serviceBreakdown.map((entry, index) => (
                      <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-grid)', borderRadius: 12, color: 'var(--chart-text)', boxShadow: 'var(--shadow-soft)' }}
                    labelStyle={{ color: 'var(--chart-text)', fontWeight: 700 }}
                    itemStyle={{ color: 'var(--chart-accent)' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <h3>Recent orders</h3>
              <Link to="/order-tracking">View all</Link>
            </div>
            {ordersError ? <p className="error-text">{ordersError}</p> : null}
            <div className="order-list">
              {orders.slice(0, 4).map((order) => (
                <div key={order.id} className="order-row">
                  <div>
                    <strong>{order.id}</strong>
                    <span>{order.items.map((item) => item.name).join(', ')}</span>
                  </div>
                  <div>
                    <strong>KSh {order.total.toLocaleString()}</strong>
                    <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div>
                    <small>{order.eta}</small>
                    <span className={`status-tag ${order.status.toLowerCase().replace(/\s+/g, '-')}`}>{order.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function AdminPage() {
  const [orders, setOrders] = useState([]);
  const [ordersError, setOrdersError] = useState('');

  useEffect(() => {
    let active = true;
    getOrders()
      .then((result) => {
        if (active) setOrders(result);
      })
      .catch((error) => {
        if (active) setOrdersError(error.message);
      });
    return () => {
      active = false;
    };
  }, []);

  const pendingOrders = orders.filter((order) => order.status === 'Pending').length;
  const completedToday = orders.filter((order) => order.status === 'Completed').length;
  const totalRevenue = orders.reduce((sum, order) => sum + order.total, 0);
  const statusChartData = ['Pending', 'In Progress', 'Picked Up', 'Completed'].map((status) => ({
    name: status,
    orders: orders.filter((order) => order.status === status).length,
  }));

  const changeOrderStatus = async (orderCode, status) => {
    try {
      const updatedOrder = await updateOrderStatus(orderCode, status);
      setOrders((current) => current.map((order) => order.id === orderCode ? updatedOrder : order));
      setOrdersError('');
    } catch (error) {
      setOrdersError(error.message);
    }
  };

  return (
    <section className="section dashboard-shell admin-shell">
      <div className="container dashboard-grid">
        <aside className="sidebar-panel">
          <div className="profile-header">
            <div className="avatar-circle accent-bg">
              <ShieldCheck size={28} />
            </div>
            <div>
              <span>Operations admin</span>
              <strong>Amina Wanjiku</strong>
            </div>
          </div>
          <div className="side-block">
            <h3>Daily summary</h3>
            <ul className="mini-list">
              <li><span>Total orders</span><strong>{orders.length}</strong></li>
              <li><span>Revenue</span><strong>KSh {totalRevenue.toLocaleString()}</strong></li>
              <li><span>Pending</span><strong>{pendingOrders}</strong></li>
            </ul>
          </div>
        </aside>

        <div className="content-panel">
          <div className="dashboard-header">
            <div>
              <span className="eyebrow">Admin dashboard</span>
              <h1>Operations overview</h1>
            </div>
          </div>

          <div className="stats-grid">
            {[
              ['Active orders', orders.filter((order) => order.status !== 'Completed').length],
              ['Pending pickup', pendingOrders],
              ['Completed orders', completedToday],
              ['Order revenue', `KSh ${totalRevenue.toLocaleString()}`],
            ].map(([label, value]) => (
              <div key={label} className="stat-card blue">
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <div className="chart-grid">
            <div className="panel-card chart-card large-chart">
              <div className="panel-header">
                <h3>Operational performance</h3>
                <span>Weekly order volume</span>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={statusChartData}>
                  <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--chart-label)', fontSize: 12 }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--chart-tooltip-bg)', border: '1px solid var(--chart-grid)', borderRadius: 12, color: 'var(--chart-text)', boxShadow: 'var(--shadow-soft)' }}
                    labelStyle={{ color: 'var(--chart-text)', fontWeight: 700 }}
                    itemStyle={{ color: 'var(--chart-accent)' }}
                    cursor={{ fill: 'var(--chart-cursor)' }}
                  />
                  <Bar dataKey="orders" radius={[8, 8, 0, 0]} fill="var(--chart-accent)" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="panel-card chart-card">
              <div className="panel-header">
                <h3>Delivery health</h3>
                <span>Flow percentage</span>
              </div>
              <div className="ring-list">
                {[
                  ['On time', '89%'],
                  ['Late', '7%'],
                  ['Pending', '4%'],
                ].map(([label, value]) => (
                  <div key={label} className="ring-line">
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <h3>Orders to process</h3>
              <span>{pendingOrders} pending review</span>
            </div>
            {ordersError ? <p className="error-text">{ordersError}</p> : null}
            <div className="admin-table">
              {orders.map((order) => (
                <div key={order.id} className="admin-row">
                  <span>{order.id}</span>
                  <span>{order.items.map((item) => item.name).join(', ')}</span>
                  <span>{order.address}</span>
                  <select
                    aria-label={`Status for ${order.id}`}
                    value={order.status}
                    onChange={(event) => changeOrderStatus(order.id, event.target.value)}
                  >
                    {['Pending', 'In Progress', 'Picked Up', 'Completed'].map((status) => (
                      <option key={status}>{status}</option>
                    ))}
                  </select>
                </div>
              ))}
              {orders.length === 0 && !ordersError ? <p>No orders are in the database yet.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DriverPage() {
  return (
    <section className="section dashboard-shell driver-shell">
      <div className="container dashboard-grid">
        <aside className="sidebar-panel">
          <div className="profile-header">
            <div className="avatar-circle accent-bg">
              <Truck size={28} />
            </div>
            <div>
              <span>Driver account</span>
              <strong>Moses Kariuki</strong>
            </div>
          </div>
          <div className="side-block">
            <h3>Today’s route</h3>
            <ul className="mini-list">
              <li><span>Route capacity</span><strong>62kg</strong></li>
              <li><span>Stops</span><strong>07</strong></li>
              <li><span>ETA</span><strong>1h 36m</strong></li>
            </ul>
          </div>
        </aside>

        <div className="content-panel">
          <div className="dashboard-header">
            <div>
              <span className="eyebrow">Driver dashboard</span>
              <h1>Assigned deliveries</h1>
            </div>
          </div>

          <div className="route-grid">
            {routeAssignments.map((route) => (
              <article key={route.id} className="route-card">
                <div className="route-top">
                  <strong>{route.id}</strong>
                  <span className={`status-tag ${route.status.toLowerCase().replace(/\s+/g, '-')}`}>{route.status}</span>
                </div>
                <h3>{route.route}</h3>
                <ul>
                  <li><Clock3 size={14} /> ETA: {route.eta}</li>
                  <li><PackageCheck size={14} /> Load: {route.weight}</li>
                </ul>
              </article>
            ))}
          </div>

          <div className="panel-card">
            <div className="panel-header">
              <h3>Dispatch status</h3>
              <span>Live route board</span>
            </div>
            <div className="dispatch-list">
              {[
                ['Westlands', 'Pickup confirmed', '08:40'],
                ['Kilimani', 'Items loaded', '09:15'],
                ['CBD', 'Delivered to customer', '09:55'],
              ].map(([location, note, time]) => (
                <div key={location} className="dispatch-row">
                  <span className="dot" />
                  <div>
                    <strong>{location}</strong>
                    <small>{note}</small>
                  </div>
                  <time>{time}</time>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <div className="container footer-grid">
        <div>
          <div className="brand footer-brand">
            <span className="brand-mark">W</span>
            <span>
              <strong>Wakwito</strong>
              <small>Laundry</small>
            </span>
          </div>
          <p>Premium Nairobi laundry services designed for speed, comfort, and trust.</p>
        </div>
        <div>
          <h4>Services</h4>
          <ul>
            <li>Washing</li>
            <li>Dry Cleaning</li>
            <li>Ironing</li>
            <li>Duvet Cleaning</li>
          </ul>
        </div>
        <div>
          <h4>Company</h4>
          <ul>
            <li>About us</li>
            <li>Pricing</li>
            <li>Pickup & delivery</li>
            <li>Support</li>
          </ul>
        </div>
        <div>
          <h4>Contact</h4>
          <ul>
            <li>Nairobi, Kenya</li>
            <li>+254 700 102 248</li>
            <li>hello@wakwito.co.ke</li>
          </ul>
        </div>
      </div>
      <div className="container footer-bottom">
        <span>© 2026 Wakwito Laundry. All rights reserved.</span>
      </div>
    </footer>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <AppLayout />
      </HashRouter>
    </AuthProvider>
  );
}
