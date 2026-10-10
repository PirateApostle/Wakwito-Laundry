import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { CalendarDays, CheckCircle2, Clock3, ExternalLink, MapPin, PackageCheck, ShoppingCart, Truck } from 'lucide-react';
import { clearCart, createOrder, getOrders, readCart } from './api';
import { useAuth } from './auth';

const serviceCatalog = [
  { id: 'washing', name: 'Washing', description: 'Standard garment washing and care', price: 99, duration: '24 hours' },
  { id: 'dry-cleaning', name: 'Dry Cleaning', description: 'Delicate fabric and formal wear care', price: 180, duration: '48 hours' },
  { id: 'ironing', name: 'Ironing', description: 'Pressing and fold finishing', price: 120, duration: 'Same day' },
  { id: 'duvet-cleaning', name: 'Duvet Cleaning', description: 'Fresh duvet and bedding care', price: 260, duration: '36 hours' },
  { id: 'curtain-cleaning', name: 'Curtain Cleaning', description: 'Rejuvenate curtains and linens', price: 220, duration: '48 hours' },
  { id: 'carpet-cleaning', name: 'Carpet Cleaning', description: 'Deep clean and refresh carpets', price: 310, duration: '48 hours' },
];

function formatCurrency(value) {
  return `KSh ${Number(value).toLocaleString()}`;
}

function getDateOffset(offset) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year').value);
  const month = Number(parts.find((part) => part.type === 'month').value);
  const day = Number(parts.find((part) => part.type === 'day').value);
  return new Date(Date.UTC(year, month - 1, day + offset)).toISOString().slice(0, 10);
}

const timeSlots = ['Morning (8am–12pm)', 'Afternoon (12pm–4pm)', 'Evening (4pm–7pm)'];

export function OrderCreationPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cart, setCart] = useState(() => readCart());
  const [selectedService, setSelectedService] = useState(serviceCatalog[0].id);
  const [weightKg, setWeightKg] = useState(2);
  const [quantity, setQuantity] = useState(1);

  useEffect(() => {
    localStorage.setItem('wakwito-cart', JSON.stringify(cart));
  }, [cart]);

  const selectedItem = useMemo(
    () => serviceCatalog.find((service) => service.id === selectedService) || serviceCatalog[0],
    [selectedService],
  );

  const addToCart = () => {
    const itemPrice = Math.round(selectedItem.price * weightKg * quantity);
    const nextItem = {
      id: `${selectedItem.id}-${Date.now()}`,
      serviceId: selectedItem.id,
      name: selectedItem.name,
      description: selectedItem.description,
      price: itemPrice,
      quantity,
      weightKg,
      unitPrice: selectedItem.price,
    };

    setCart((current) => [...current, nextItem]);
    setQuantity(1);
    setWeightKg(2);
  };

  const removeItem = (itemId) => {
    setCart((current) => current.filter((item) => item.id !== itemId));
  };

  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0), 0);

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return (
    <section className="section order-page-shell">
      <div className="container order-layout">
        <div className="order-main-panel">
          <div className="page-header-row">
            <div>
              <span className="eyebrow">New order</span>
              <h1>Create your laundry basket</h1>
            </div>
            <Link to="/dashboard" className="button secondary-button small-button">Back to dashboard</Link>
          </div>

          <div className="catalog-grid">
            {serviceCatalog.map((service) => (
              <button
                type="button"
                key={service.id}
                className={`catalog-card ${selectedService === service.id ? 'active' : ''}`}
                onClick={() => setSelectedService(service.id)}
              >
                <div>
                  <strong>{service.name}</strong>
                  <span>{service.description}</span>
                </div>
                <small>{formatCurrency(service.price)} / kg</small>
              </button>
            ))}
          </div>

          <div className="service-config-panel">
            <div>
              <label>
                Estimated weight (kg)
                <input type="number" min="1" step="0.5" value={weightKg} onChange={(event) => setWeightKg(Number(event.target.value) || 1)} />
              </label>
            </div>
            <div>
              <label>
                Quantity
                <input type="number" min="1" max="10" value={quantity} onChange={(event) => setQuantity(Number(event.target.value) || 1)} />
              </label>
            </div>
            <button type="button" className="button primary-button" onClick={addToCart}>
              Add to cart
            </button>
          </div>
        </div>

        <aside className="order-summary-card">
          <div className="panel-header">
            <h3>Cart summary</h3>
            <span>{cart.length} items</span>
          </div>

          {cart.length === 0 ? (
            <div className="empty-state">
              <ShoppingCart size={26} />
              <p>Your cart is empty. Add a service to get started.</p>
            </div>
          ) : (
            <div className="cart-list">
              {cart.map((item) => (
                <div key={item.id} className="cart-item">
                  <div>
                    <strong>{item.name}</strong>
                    <span>{item.weightKg} kg x {item.quantity}</span>
                  </div>
                  <div className="cart-side">
                    <strong>{formatCurrency(item.price)}</strong>
                    <button type="button" onClick={() => removeItem(item.id)}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="totals-box">
            <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
            <div><span>Service fee</span><strong>{formatCurrency(Math.round(subtotal * 0.08))}</strong></div>
            <div className="grand-total"><span>Total</span><strong>{formatCurrency(subtotal + Math.round(subtotal * 0.08))}</strong></div>
          </div>

          <button
            type="button"
            className="button primary-button full-width"
            disabled={cart.length === 0}
            onClick={() => navigate('/checkout')}
          >
            Continue to checkout
          </button>
        </aside>
      </div>
    </section>
  );
}

export function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [cart] = useState(() => readCart());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    customerName: user?.name || '',
    phone: user?.phone || '',
    address: user?.location || '',
    mapUrl: '',
    fulfillment: 'Pickup + Delivery',
    scheduledDate: getDateOffset(1),
    timeSlot: timeSlots[0],
    paymentMethod: 'M-Pesa',
    notes: '',
  });

  useEffect(() => {
    if (!cart.length) {
      navigate('/new-order');
    }
  }, [cart, navigate]);

  const subtotal = cart.reduce((sum, item) => sum + Number(item.price || 0), 0);
  const total = subtotal + Math.round(subtotal * 0.08);
  const mapsQuery = form.address.trim();
  const mapSearchUrl = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : 'https://www.google.com/maps';

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const order = await createOrder({
        customerName: form.customerName,
        phone: form.phone,
        address: form.address,
        mapUrl: form.mapUrl,
        fulfillment: form.fulfillment,
        scheduledDate: form.scheduledDate,
        timeSlot: form.timeSlot,
        paymentMethod: form.paymentMethod,
        notes: form.notes,
        items: cart.map((item) => ({
          id: item.serviceId,
          kg: item.weightKg,
          quantity: item.quantity,
        })),
      });

      clearCart();
      localStorage.setItem('wakwito-last-order', order.id);
      navigate('/order-tracking');
    } catch (orderError) {
      setError(orderError.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="section order-page-shell">
      <div className="container checkout-layout">
        <form className="form-card checkout-card" onSubmit={handleSubmit}>
          <div className="page-header-row small-gap">
            <div>
              <span className="eyebrow">Checkout</span>
              <h1>Finalize your order</h1>
            </div>
          </div>

          <div className="two-col">
            <label>
              Full name
              <input name="customerName" value={form.customerName} onChange={handleChange} required />
            </label>
            <label>
              Phone number
              <input name="phone" value={form.phone} onChange={handleChange} required />
            </label>
          </div>

          <label>
            Pickup or delivery address
            <input name="address" value={form.address} onChange={handleChange} maxLength={240} autoComplete="street-address" required />
          </label>

          <div className="location-map-card">
            <div className="location-map-heading">
              <div>
                <span className="eyebrow"><MapPin size={15} /> Pickup location</span>
                <p>Search your address in Google Maps, then share the pin link below so the driver can find you.</p>
              </div>
              <a className="button secondary-button small-button" href={mapSearchUrl} target="_blank" rel="noopener noreferrer">
                Find location on Google Maps <ExternalLink size={15} />
              </a>
            </div>
            <label>
              Google Maps pin link <span className="optional-label">(optional)</span>
              <input
                name="mapUrl"
                type="url"
                inputMode="url"
                maxLength={2048}
                value={form.mapUrl}
                onChange={handleChange}
                placeholder="Paste a https://maps.app.goo.gl/... share link"
              />
              <small>In Google Maps, tap Share and copy the link to your pinned location.</small>
            </label>
          </div>

          <div className="two-col">
            <label>
              Service date
              <input
                name="scheduledDate"
                type="date"
                min={getDateOffset(1)}
                value={form.scheduledDate}
                onChange={handleChange}
                required
              />
            </label>
            <label>
              Pickup time window
              <select name="timeSlot" value={form.timeSlot} onChange={handleChange} required>
                {timeSlots.map((slot) => <option key={slot}>{slot}</option>)}
              </select>
            </label>
          </div>

          <div className="two-col">
            <label>
              Fulfillment type
              <select name="fulfillment" value={form.fulfillment} onChange={handleChange}>
                <option>Customer Drop-off</option>
                <option>Pickup</option>
                <option>Delivery</option>
                <option>Pickup + Delivery</option>
              </select>
            </label>
            <label>
              Payment method
              <select name="paymentMethod" value={form.paymentMethod} onChange={handleChange}>
                <option>M-Pesa</option>
                <option>Cash</option>
              </select>
            </label>
          </div>

          <label>
            Special instructions
            <textarea name="notes" value={form.notes} onChange={handleChange} rows="4" placeholder="Any stains, fabric concerns, or delivery requests?" />
          </label>

          {error ? <p className="error-text">{error}</p> : null}
          <button type="submit" className="button primary-button full-width" disabled={submitting}>
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
        </form>

        <aside className="order-summary-card">
          <div className="panel-header">
            <h3>Order review</h3>
            <span>{cart.length} items</span>
          </div>
          <div className="cart-list">
            {cart.map((item) => (
              <div key={item.id} className="cart-item">
                <div>
                  <strong>{item.name}</strong>
                  <span>{item.weightKg} kg</span>
                </div>
                <strong>{formatCurrency(item.price)}</strong>
              </div>
            ))}
          </div>
          <div className="totals-box">
            <div><span>Subtotal</span><strong>{formatCurrency(subtotal)}</strong></div>
            <div><span>Service fee</span><strong>{formatCurrency(Math.round(subtotal * 0.08))}</strong></div>
            <div className="grand-total"><span>Total</span><strong>{formatCurrency(total)}</strong></div>
          </div>
        </aside>
      </div>
    </section>
  );
}

export function OrderTrackingPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    getOrders()
      .then((allOrders) => {
        if (active) setOrders(allOrders);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user]);

  if (!user) {
    return <Navigate to="/signin" replace />;
  }

  return (
    <section className="section order-page-shell">
      <div className="container tracking-container">
        <div className="page-header-row">
          <div>
            <span className="eyebrow">Order tracking</span>
            <h1>Track your laundry progress</h1>
          </div>
          <Link to="/new-order" className="button primary-button small-button">New order</Link>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        <div className="tracking-grid">
          {loading ? (
            <div className="panel-card empty-track-panel"><p>Loading your orders…</p></div>
          ) : orders.length === 0 ? (
            <div className="panel-card empty-track-panel">
              <PackageCheck size={28} />
              <p>No orders yet. Place your first laundry request to start tracking.</p>
            </div>
          ) : (
            orders.map((order) => (
              <article key={order.id} className="panel-card tracking-card">
                <div className="tracking-header">
                  <div>
                    <span className="order-id">{order.id}</span>
                    <strong>{order.fulfillment}</strong>
                  </div>
                  <span className={`status-tag ${String(order.status).toLowerCase().replace(/\s+/g, '-')}`}>{order.status}</span>
                </div>

                <div className="tracking-body">
                  {order.scheduledDate ? (
                    <div className="tracking-detail">
                      <CalendarDays size={16} />
                      <span>{new Date(`${order.scheduledDate}T00:00:00`).toLocaleDateString()} · {order.timeSlot}</span>
                    </div>
                  ) : null}
                  <div className="tracking-detail">
                    <Clock3 size={16} />
                    <span>{order.eta}</span>
                  </div>
                  <div className="tracking-detail">
                    <Truck size={16} />
                    <span>{order.address}</span>
                  </div>
                  {order.mapUrl ? (
                    <a className="tracking-detail tracking-map-link" href={order.mapUrl} target="_blank" rel="noopener noreferrer">
                      <MapPin size={16} />
                      <span>Open pickup pin in Google Maps <ExternalLink size={14} /></span>
                    </a>
                  ) : null}
                  <div className="tracking-detail">
                    <CheckCircle2 size={16} />
                    <span>{order.paymentMethod}</span>
                  </div>
                </div>

                <div className="timeline-steps">
                  {['Pending', 'In Progress', 'Picked Up', 'Completed'].map((step) => (
                    <div key={step} className={`timeline-step ${order.status === step || (step === 'Pending' && !order.status) ? 'active' : ''}`}>
                      {step}
                    </div>
                  ))}
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
