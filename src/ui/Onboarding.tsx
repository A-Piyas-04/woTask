import { useStore } from '../state/store';
import { RegionForm } from './RegionForm';

/** First run: the app has no regions until the user names one. Blocks everything else. */
export function Onboarding() {
  const createRegion = useStore((s) => s.createRegion);
  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <h1 id="onboarding-title">What are you working on?</h1>
        <p>
          Each region is its own patch of space — a category, a project or a goal. Your tasks orbit inside it. You can add more
          regions later.
        </p>
        <RegionForm
          autoFocus
          initial={{ name: '', kind: 'project', description: '', colorIndex: 0, targetDate: null }}
          submitLabel="Create region"
          onSubmit={(d) => void createRegion({ ...d, description: d.description || null })}
        />
      </div>
    </div>
  );
}
