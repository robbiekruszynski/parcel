// Auth is now handled by the combined (auth)/index.tsx screen.
import { Redirect } from 'expo-router';
export default function SignInRedirect() {
  return <Redirect href="/(auth)" />;
}
