import { useAuth } from '../features/auth/useAuth';
import ProfileForm from '../features/users/ProfileForm';
import PasswordForm from '../features/users/PasswordForm';

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <section className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-bold">
        <span className="text-gradient">Your profile</span>
      </h1>
      <ProfileForm user={user} />
      <PasswordForm />
    </section>
  );
}