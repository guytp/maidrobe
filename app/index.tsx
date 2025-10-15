import { Redirect } from 'expo-router';

export default function Index() {
  // For now, redirect to home. In a real app, this would check auth status
  // and redirect to either /login or /home accordingly
  return <Redirect href="/(tabs)/home" />;
}
