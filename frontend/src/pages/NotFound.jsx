import { CompassIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <EmptyState
      tone="purple"
      icon={<CompassIcon className="h-6 w-6" />}
      title="Screen not found"
      description="That screen doesn't exist on this terminal. Head back to your dashboard to keep working."
      action={
        <>
          <Button variant="outline" className="mr-2" onClick={() => navigate(-1)}>
            Go back
          </Button>
          <Button variant="dark" onClick={() => navigate('/')}>
            Back to dashboard
          </Button>
        </>
      }
    />);

}