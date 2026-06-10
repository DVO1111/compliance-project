import { useState, useEffect, useCallback } from 'react';
import { Truck, Plus, Package, MapPin, Clock, ChevronRight, X, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import {
  Shipment, ShipmentEvent, ShipmentEventType, ShipmentStatus,
  SHIPMENT_STATUS_LABELS, SHIPMENT_STATUS_COLORS, SHIPMENT_STATUS_DOT,
  EVENT_TYPE_LABELS, EVENT_DOT_COLOR, ALL_EVENT_TYPES, SERVICE_TYPES, COUNTRIES,
  listShipments, createShipment, getShipmentEvents, addShipmentEvent,
} from '../../lib/shipmentEventService';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const countryName = (code: string) =>
  COUNTRIES.find(c => c.code === code)?.label ?? code;

// ── Create Shipment Modal ─────────────────────────────────────────────

interface CreateShipmentModalProps {
  companyId: string;
  userId: string;
  onClose: () => void;
  onSaved: (s: Shipment) => void;
}

function CreateShipmentModal({ companyId, userId, onClose, onSaved }: CreateShipmentModalProps) {
  const [reference, setReference] = useState('');
  const [description, setDescription] = useState('');
  const [origin, setOrigin] = useState('GB');
  const [destination, setDestination] = useState('NG');
  const [senderName, setSenderName] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [serviceType, setServiceType] = useState('Air Freight');
  const [weightKg, setWeightKg] = useState('');
  const [declaredValue, setDeclaredValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!reference.trim()) { setError('Shipment reference is required.'); return; }
    setSaving(true); setError('');
    try {
      const s = await createShipment(companyId, userId, {
        reference: reference.trim(),
        description: description.trim() || undefined,
        origin_country: origin,
        destination_country: destination,
        sender_name: senderName.trim() || undefined,
        recipient_name: recipientName.trim() || undefined,
        service_type: serviceType,
        weight_kg: weightKg ? parseFloat(weightKg) : null,
        declared_value_gbp: declaredValue ? parseFloat(declaredValue) : null,
      });
      onSaved(s);
    } catch (e: any) {
      setError(e.message || 'Failed to create shipment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="w-full max-w-lg dash-card border dash-border rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">Log New Shipment</h2>
          <button onClick={onClose} className="text-white/50 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {error && (
          <div className="mb-4 px-4 py-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm">{error}</div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">Shipment Reference *</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              placeholder="e.g. RX-2026-00142"
              value={reference}
              onChange={e => setReference(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">Contents Description</label>
            <input
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
              placeholder="Brief description of contents"
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Origin Country</label>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                value={origin}
                onChange={e => setOrigin(e.target.value)}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code} className="bg-gray-900">{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Destination Country</label>
              <select
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
                value={destination}
                onChange={e => setDestination(e.target.value)}
              >
                {COUNTRIES.map(c => (
                  <option key={c.code} value={c.code} className="bg-gray-900">{c.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Sender Name</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                placeholder="Sender"
                value={senderName}
                onChange={e => setSenderName(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Recipient Name</label>
              <input
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                placeholder="Recipient"
                value={recipientName}
                onChange={e => setRecipientName(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-white/60 mb-1">Service Type</label>
            <select
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/30"
              value={serviceType}
              onChange={e => setServiceType(e.target.value)}
            >
              {SERVICE_TYPES.map(s => (
                <option key={s} value={s} className="bg-gray-900">{s}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Weight (kg)</label>
              <input
                type="number"
                min="0"
                step="0.001"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                placeholder="0.000"
                value={weightKg}
                onChange={e => setWeightKg(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/60 mb-1">Declared Value (£)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-white/30"
                placeholder="0.00"
                value={declaredValue}
                onChange={e => setDeclaredValue(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:border-white/30 text-sm transition">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 px-4 py-2 rounded-lg bg-[var(--color-success)]/20 border border-[var(--color-success)]/40 text-[var(--color-success)] hover:bg-[var(--color-success)]/30 text-sm font-medium transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Create Shipment'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── Timeline Modal ─────────────────────────────────────────────────────

interface TimelineModalProps {
  shipment: Shipment;
  companyId: string;
  userId: string;
  onClose: () => void;
  onStatusChange: (id: string, status: ShipmentStatus) => void;
}

function TimelineModal({ shipment, companyId, userId, onClose, onStatusChange }: TimelineModalProps) {
  const [events, setEvents] = useState<ShipmentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [eventType, setEventType] = useState<ShipmentEventType>('note');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState('');
  const [currentStatus, setCurrentStatus] = useState<ShipmentStatus>(shipment.status);

  useEffect(() => {
    getShipmentEvents(companyId, shipment.id)
      .then(setEvents)
      .finally(() => setLoading(false));
  }, [companyId, shipment.id]);

  const handleAddEvent = async () => {
    setSaving(true); setAddError('');
    try {
      const ev = await addShipmentEvent(companyId, userId, shipment.id, {
        event_type: eventType,
        location: location.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setEvents(prev => [ev, ...prev]);
      // Reflect status update in UI immediately
      import('../../lib/shipmentEventService').then(({ STATUS_ADVANCE }) => {
        const ns = STATUS_ADVANCE[eventType];
        if (ns) { setCurrentStatus(ns); onStatusChange(shipment.id, ns); }
      });
      setShowAddForm(false);
      setLocation(''); setNotes(''); setEventType('note');
    } catch (e: any) {
      setAddError(e.message || 'Failed to add event.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <motion.div
        initial={{ opacity: 0, x: 40 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 40 }}
        className="w-full max-w-lg dash-card border dash-border rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-white">{shipment.reference}</h2>
            <p className="text-xs text-white/50 mt-0.5">
              {countryName(shipment.origin_country)} → {countryName(shipment.destination_country)} · {shipment.service_type}
            </p>
          </div>
          <button onClick={onClose} className="text-white/50 hover:text-white mt-0.5"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${SHIPMENT_STATUS_COLORS[currentStatus]}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${SHIPMENT_STATUS_DOT[currentStatus]}`} />
            {SHIPMENT_STATUS_LABELS[currentStatus]}
          </span>
          {shipment.weight_kg && <span className="text-xs text-white/40">{shipment.weight_kg} kg</span>}
          {shipment.declared_value_gbp && <span className="text-xs text-white/40">£{Number(shipment.declared_value_gbp).toFixed(2)}</span>}
        </div>

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-white/80">Event Timeline</h3>
          <button
            onClick={() => setShowAddForm(f => !f)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--color-success)]/15 border border-[var(--color-success)]/30 text-[var(--color-success)] text-xs font-medium hover:bg-[var(--color-success)]/25 transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Event
          </button>
        </div>

        <AnimatePresence>
          {showAddForm && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mb-4"
            >
              <div className="bg-white/5 border border-white/10 rounded-xl p-4 space-y-3">
                {addError && <p className="text-red-300 text-xs">{addError}</p>}
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Event Type</label>
                  <select
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none"
                    value={eventType}
                    onChange={e => setEventType(e.target.value as ShipmentEventType)}
                  >
                    {ALL_EVENT_TYPES.map(t => (
                      <option key={t} value={t} className="bg-gray-900">{EVENT_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Location</label>
                  <input
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none"
                    placeholder="e.g. Heathrow, Lagos Port"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1">Notes</label>
                  <textarea
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none resize-none"
                    rows={2}
                    placeholder="Optional notes…"
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setShowAddForm(false)} className="flex-1 px-3 py-2 rounded-lg border border-white/15 text-white/60 hover:text-white text-xs transition">
                    Cancel
                  </button>
                  <button
                    onClick={handleAddEvent}
                    disabled={saving}
                    className="flex-1 px-3 py-2 rounded-lg bg-[var(--color-success)]/20 border border-[var(--color-success)]/40 text-[var(--color-success)] text-xs font-medium hover:bg-[var(--color-success)]/30 transition disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" /> : 'Add Event'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-10">
            <Clock className="w-8 h-8 text-white/20 mx-auto mb-2" />
            <p className="text-sm text-white/40">No events logged yet.</p>
          </div>
        ) : (
          <div>
            {events.map((ev, idx) => (
              <div key={ev.id} className="relative flex gap-4">
                {idx < events.length - 1 && (
                  <div className="absolute left-[6px] top-5 bottom-0 w-px bg-white/10" />
                )}
                <div className={`w-3 h-3 rounded-full mt-1.5 flex-shrink-0 ${EVENT_DOT_COLOR[ev.event_type] ?? 'bg-white/30'}`} />
                <div className="flex-1 pb-5">
                  <p className="text-sm font-medium text-white">{EVENT_TYPE_LABELS[ev.event_type]}</p>
                  {ev.location && (
                    <p className="text-xs text-white/50 mt-0.5 flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{ev.location}
                    </p>
                  )}
                  {ev.notes && <p className="text-xs text-white/40 mt-1">{ev.notes}</p>}
                  <p className="text-xs text-white/30 mt-1.5">
                    {new Date(ev.occurred_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}
                    {ev.created_by_profile?.full_name && ` · ${ev.created_by_profile.full_name}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────

const ACTIVE_STATUSES: ShipmentStatus[] = [
  'created', 'collected', 'in_transit', 'customs_hold', 'cleared', 'out_for_delivery', 'exception',
];

export default function ShipmentEventLogPage() {
  const { profile, user } = useAuth();
  const companyId = (profile as any)?.company_id ?? '';
  const userId = user?.id ?? '';

  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedShipment, setSelectedShipment] = useState<Shipment | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true); setError('');
    try { setShipments(await listShipments(companyId)); }
    catch (e: any) { setError(e.message || 'Failed to load shipments.'); }
    finally { setLoading(false); }
  }, [companyId]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = (shipmentId: string, status: ShipmentStatus) => {
    setShipments(prev => prev.map(s => s.id === shipmentId ? { ...s, status } : s));
    if (selectedShipment?.id === shipmentId) {
      setSelectedShipment(prev => prev ? { ...prev, status } : prev);
    }
  };

  const visible = tab === 'active'
    ? shipments.filter(s => ACTIVE_STATUSES.includes(s.status))
    : shipments;

  const inTransit  = shipments.filter(s => s.status === 'in_transit' || s.status === 'out_for_delivery').length;
  const delivered  = shipments.filter(s => s.status === 'delivered').length;
  const exceptions = shipments.filter(s => s.status === 'exception').length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <motion.div variants={fadeUp} initial="hidden" animate="visible"
        className="flex items-center justify-between"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--color-success)]/15 border border-[var(--color-success)]/30 flex items-center justify-center">
            <Truck className="w-5 h-5 text-[var(--color-success)]" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Shipment Event Log</h1>
            <p className="text-xs text-white/50">Track lifecycle events for all shipments on the UK-Nigeria corridor</p>
          </div>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[var(--color-success)]/20 border border-[var(--color-success)]/40 text-[var(--color-success)] hover:bg-[var(--color-success)]/30 text-sm font-medium transition"
        >
          <Plus className="w-4 h-4" /> Log Shipment
        </button>
      </motion.div>

      <motion.div variants={fadeUp} initial="hidden" animate="visible"
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {[
          { label: 'Total Shipments', value: shipments.length, cls: 'text-white' },
          { label: 'In Transit',      value: inTransit,        cls: 'text-yellow-300' },
          { label: 'Delivered',       value: delivered,        cls: 'text-green-300' },
          { label: 'Exceptions',      value: exceptions,       cls: 'text-red-300' },
        ].map(kpi => (
          <div key={kpi.label} className="dash-card border dash-border rounded-xl p-4">
            <p className="text-xs text-white/50 mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.cls}`}>{kpi.value}</p>
          </div>
        ))}
      </motion.div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/15 border border-red-500/30 text-red-300 text-sm">{error}</div>
      )}

      <motion.div variants={fadeUp} initial="hidden" animate="visible"
        className="dash-card border dash-border rounded-2xl overflow-hidden"
      >
        <div className="flex items-center gap-1 border-b border-white/10 px-4 pt-4">
          {(['active', 'all'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-medium rounded-t-lg transition ${
                tab === t ? 'text-white border-b-2 border-[var(--color-success)]' : 'text-white/50 hover:text-white/80'
              }`}
            >
              {t === 'active' ? 'Active' : 'All Shipments'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-white/40" />
          </div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16">
            <Package className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-sm text-white/50">No shipments {tab === 'active' ? 'in progress' : 'logged'} yet.</p>
            <p className="text-xs text-white/30 mt-1">Click "Log Shipment" to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Reference', 'Route', 'Service', 'Status', 'Sender → Recipient', 'Weight', ''].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-white/40 text-xs font-medium uppercase">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map(s => (
                  <tr key={s.id} className="border-b border-white/5 hover:bg-white/3 transition">
                    <td className="px-4 py-3 font-mono text-xs text-white/90">{s.reference}</td>
                    <td className="px-4 py-3 text-white/70 text-xs whitespace-nowrap">
                      {countryName(s.origin_country).split(' ')[0]} → {countryName(s.destination_country).split(' ')[0]}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs">{s.service_type}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${SHIPMENT_STATUS_COLORS[s.status]}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${SHIPMENT_STATUS_DOT[s.status]}`} />
                        {SHIPMENT_STATUS_LABELS[s.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs">
                      {s.sender_name && s.recipient_name
                        ? `${s.sender_name} → ${s.recipient_name}`
                        : s.sender_name || s.recipient_name || '—'}
                    </td>
                    <td className="px-4 py-3 text-white/60 text-xs">
                      {s.weight_kg ? `${s.weight_kg} kg` : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedShipment(s)}
                        className="flex items-center gap-1 text-xs text-[var(--color-success)] hover:opacity-80 transition"
                      >
                        Timeline <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showCreateModal && (
          <CreateShipmentModal
            companyId={companyId}
            userId={userId}
            onClose={() => setShowCreateModal(false)}
            onSaved={s => {
              setShipments(prev => [s, ...prev]);
              setShowCreateModal(false);
              setSelectedShipment(s);
            }}
          />
        )}
        {selectedShipment && (
          <TimelineModal
            shipment={selectedShipment}
            companyId={companyId}
            userId={userId}
            onClose={() => setSelectedShipment(null)}
            onStatusChange={handleStatusChange}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
