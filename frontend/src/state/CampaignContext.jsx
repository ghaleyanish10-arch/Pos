import { createContext, useContext, useState } from 'react';
import { campaigns as initialCampaigns } from '../data/business';

const CampaignContext = createContext(null);

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

  const upsertCampaign = (campaign) => {
    setCampaignList((prev) => {
      const exists = prev.some((c) => c.id === campaign.id);
      return exists
        ? prev.map((c) => (c.id === campaign.id ? campaign : c))
        : [campaign, ...prev];
    });
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