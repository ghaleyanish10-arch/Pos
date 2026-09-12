import { useNavigate } from 'react-router-dom';
import { ShieldAlertIcon } from 'lucide-react';
import { Button } from '../ui/Button';
import { ROLES, useRole } from '../../state/RoleContext';

export function RestrictedState({ pageLabel }) {
  const { role } = useRole();
  const navigate = useNavigate();
  const target = ROLES[role].defaultPath;

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-[440px] rounded-xl border-2 border-dashed border-line bg-surface px-8 py-14 text-center">
        <span className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-tint-red">
          <ShieldAlertIcon className="h-6 w-6 text-status-red" />
        </span>
        <h2 className="text-xl font-extrabold tracking-tight text-ink">
          Restricted for {ROLES[role].label}
        </h2>
        <p className="mx-auto mt-2 max-w-[300px] text-sm text-meta">
          {pageLabel} is not part of your role's workspace — your dashboard is a click away.
        </p>
        <Button
          variant="dark"
          className="mt-6"
          onClick={() => navigate(target)}>
          
          Go to my dashboard
        </Button>
      </div>
    </div>);

}