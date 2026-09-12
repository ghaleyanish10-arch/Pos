import { Component } from 'react';
import { TriangleAlertIcon } from 'lucide-react';
import { Button } from './Button';
import { EmptyState } from './EmptyState';

export class ErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <EmptyState
          tone="red"
          icon={<TriangleAlertIcon className="h-6 w-6" />}
          title="Something went wrong"
          description="This screen failed to load. Your data is safe — reload the terminal to get back to work."
          action={
            <Button variant="dark" onClick={() => window.location.reload()}>
              Reload terminal
            </Button>
          }
        />);
    }
    return this.props.children;
  }
}