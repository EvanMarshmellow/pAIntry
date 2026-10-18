import { Redirect } from 'expo-router'

// Login is disabled — always land on the home tabs.
export default function SignIn() {
  return <Redirect href="/" />
}
