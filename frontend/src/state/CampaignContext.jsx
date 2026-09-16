import { createContext, useContext, useEffect, useState } from 'react';
import { campaigns as initialCampaigns } from '../data/business';
import api from '../api/client';

const CampaignContext = createContext(null);

// Demo banner shown in the storefront when no live (Scheduled) campaign exists
// yet — a real campaign scheduled from Marketing takes precedence everywhere.
export const DEMO_CAMPAIGN = {
  id: 'demo-scheduled',
  name: 'Dashain set menu preview',
  channel: 'Email',
  audience: '1,204 members',
  status: 'Scheduled',
  stat: 'Sends Fri 09:00',
  previewStart: '2026-09-08',
  preorderStart: '2026-09-11',
  orderStart: '2026-09-20',
  dish: 'Momo Jhol',
  message: 'Pre-order Momo Jhol now and get 15% off before Dashain week.'
};

const fromApi = (c) => ({
  id: c.id,
  name: c.name,
  channel: c.channel || 'Email',
  audience: c.audience || '',
  status: c.status || 'Draft',
  stat: c.stat || '',
  ai: c.ai_generated || false
});

const at = (d) => (d ? new Date(`${d}T00:00:00`) : null);

export const campaignPhase = (c) => {
  if (!c) return 'hidden';
  const today = new Date(new Date().toDateString());
  const preview = at(c.previewStart) || today;
  const preorder = at(c.preorderStart);
  const order = at(c.orderStart);
  if (order && today >= order) return 'order';
  if (preorder && today >= preorder) return 'preorder';
  if (today >= preview) return 'preview';
  return 'hidden';
};

const fmtShort = (d) =>
  new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

export const timeline = (c) => {
  if (!c) return [];
  const steps = [
    { label: 'Preview', date: c.previewStart },
    { label: 'Pre-order', date: c.preorderStart },
    { label: 'Order', date: c.orderStart }
  ];
  return steps.filter((s) => s.date).map((s) => ({ ...s, display: fmtShort(s.date) }));
};

export const phaseWindow = (c, phase) => {
  if (!c) return null;
  if (phase === 'preview' && c.previewStart && c.preorderStart) {
    return `${fmtShort(c.previewStart)} – ${fmtShort(c.preorderStart)}`;
  }
  if (phase === 'preorder' && c.preorderStart && c.orderStart) {
    return `${fmtShort(c.preorderStart)} – ${fmtShort(c.orderStart)}`;
  }
  if (phase === 'order' && c.orderStart) return `from ${fmtShort(c.orderStart)}`;
  return null;
};

export const phaseNext = (c, phase) => {
  if (!c) return null;
  if (phase === 'preview' && c.preorderStart) return `Pre-order opens ${fmtShort(c.preorderStart)}`;
  if (phase === 'preorder' && c.orderStart) return `Order opens ${fmtShort(c.orderStart)}`;
  return null;
};

export function CampaignProvider({ children }) {
  const [campaignList, setCampaignList] = useState(initialCampaigns);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api('/campaigns');
        if (cancelled) return;
        const data = res?.data || [];
        if (data.length > 0) setCampaignList(data.map(fromApi));
      } catch {
        /* keep static demo data as fallback */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const upsertCampaign = (campaign) => {
    setCampaignList((prev) => {
      const exists = prev.some((c) => c.id === campaign.id);
      return exists
        ? prev.map((c) => (c.id === campaign.id ? campaign : c))
        : [campaign, ...prev];
    });
    const safe = {
      name: campaign?.name,
      channel: campaign?.channel,
      audience: campaign?.audience,
      status: campaign?.status
    };
    if (campaign?.id) {
      api(`/campaigns/${campaign.id}`, {
        method: 'PUT',
        body: { name: safe.name, status: safe.status }
      }).catch(() => {});
    } else {
      api('/campaigns', { method: 'POST', body: safe })
        .then((res) => {
          if (res?.id) {
            setCampaignList((prev) =>
              prev.map((c) => (c === campaign ? { ...c, id: res.id } : c)));
          }
        })
        .catch(() => {});
    }
  };

  const deleteCampaign = (id) =>
    setCampaignList((prev) => prev.filter((c) => c.id !== id));

  return (
    <CampaignContext.Provider
      value={{ campaignList, upsertCampaign, deleteCampaign }}>
      {children}
    </CampaignContext.Provider>
  );
}

export const useCampaigns = () => useContext(CampaignContext);