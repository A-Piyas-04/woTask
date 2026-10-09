import { useStore } from '../state/store';
import { SpaceForm } from './SpaceForm';

/** First run: the app has no spaces until the user names one. Blocks everything else. */
export function Onboarding() {
  const createSpace = useStore((s) => s.createSpace);
  return (
    <div className="onboarding" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-card">
        <h1 id="onboarding-title">What are you working on?</h1>
        <p>
          A space is a category, a project or a goal — its own patch of the universe, with your tasks orbiting inside it. You
          can add more spaces later.
        </p>
        <SpaceForm
          autoFocus
          initial={{ name: '', kind: 'project', description: '', colorIndex: 0, targetDate: null }}
          submitLabel="Create space"
          onSubmit={(d) => void createSpace({ ...d, description: d.description || null })}
        />
      </div>
    </div>
  );
}
