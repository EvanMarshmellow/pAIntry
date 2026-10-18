import Ionicons from '@expo/vector-icons/Ionicons'
import * as Haptics from 'expo-haptics'
import { useEffect, useRef, useState } from 'react'
import { Image, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Button, ButtonIcon, ButtonText } from '@/components/Button'
import { COMMON_ALLERGIES, loadAllergies, normalizeAllergy, saveAllergies } from '@/lib/allergies'
import { ApiError, api } from '@/lib/api'
import { useSession } from '@/lib/session'
import { supabase } from '@/lib/supabase'
import { colors, radius, type } from '@/theme'

const FOODS = [
  require('../../assets/elements/vegies.png'),
  require('../../assets/elements/protein.png'),
  require('../../assets/elements/grain.png'),
  require('../../assets/elements/sweet.png'),
]

// Demo bypass for UI testing: either of these skips Supabase and signs in as Maya (seed user).
const BYPASS_DIGITS = '0000000000'
const BYPASS_EMAIL = 'hello@uw.edu'
const DEMO_USER_ID = '665f00000000000000000001'

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
const isBypass = (value: string) =>
  value.trim().toLowerCase() === BYPASS_EMAIL || (value.replace(/\D/g, '') === BYPASS_DIGITS && !value.includes('@'))

function sendError(e: unknown) {
  const status = (e as { status?: number })?.status
  if (status === 429) return 'Too many codes requested. Wait a minute and try again.'
  // Show Supabase's reason (e.g. "Error sending confirmation email") so setup problems are visible.
  const reason = e instanceof Error && e.message ? ` (${e.message})` : ''
  return `We couldn't email you a code${reason}. Try again in a moment.`
}

function exchangeError(e: unknown) {
  if (e instanceof ApiError) {
    if (e.status === 0) return "Can't reach pAIntry. Check your connection."
    if (e.status === 401) return 'Your sign-in expired. Send a new code.'
    return e.message
  }
  return "That code didn't work. Check the email and try again."
}

export default function SignIn() {
  const { signIn } = useSession()
  const [email, setEmail] = useState('')
  // Set once a code was sent; switches the screen to the code step.
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState<'send' | 'verify' | 'google' | 'finish' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Set once the person is verified; switches the screen to the allergies step.
  const [verifiedId, setVerifiedId] = useState<string | null>(null)
  const [allergies, setAllergies] = useState<string[]>([])
  const [otherAllergy, setOtherAllergy] = useState('')
  const codeInput = useRef<TextInput>(null)
  // verifyOtp and the SIGNED_IN event both deliver the same token; exchange it once.
  const exchanged = useRef<string | null>(null)

  const canSend = isEmail(email) || isBypass(email)

  // Prefill with what this device saved before, else the server profile.
  async function askAllergies(userId: string) {
    const [user, saved] = await Promise.all([api.user(userId), loadAllergies(userId)])
    setAllergies(saved ?? (user.allergies ?? []).map(normalizeAllergy))
    setVerifiedId(userId)
  }

  // Supabase proved the email; the backend maps that to (or creates) the Mongo user.
  async function exchange(accessToken: string) {
    if (exchanged.current === accessToken) return
    exchanged.current = accessToken
    const { user_id } = await api.loginSupabase(accessToken)
    await askAllergies(user_id)
  }

  function exchangeInBackground(accessToken: string) {
    if (exchanged.current === accessToken) return
    setPending('verify')
    exchange(accessToken)
      .catch((e) => {
        exchanged.current = null
        setError(exchangeError(e))
      })
      .finally(() => setPending(null))
  }

  // Pick up a Supabase session that already exists: back from Google or an
  // emailed magic link (web, session in the URL), or still signed in to Supabase.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) exchangeInBackground(data.session.access_token)
    })
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) exchangeInBackground(session.access_token)
    })
    return () => data.subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Web only: Supabase redirects to Google and back to /sign-in, where the effect above finishes.
  async function google() {
    setPending('google')
    setError(null)
    // A disabled provider would strand the person on Supabase's raw JSON error page.
    const settings = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '' },
    })
      .then((r) => r.json())
      .catch(() => null)
    if (settings && !settings.external?.google) {
      setError('Google sign-in isn’t turned on yet. Use your email instead.')
      setPending(null)
      return
    }
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/sign-in` },
    })
    if (oauthError) {
      setError(`Google sign-in isn't available right now (${oauthError.message}).`)
      setPending(null)
    }
  }

  async function sendCode(resend = false) {
    if (!canSend) return
    setPending('send')
    setError(null)
    setNotice(null)
    try {
      if (isBypass(email)) {
        await askAllergies(DEMO_USER_ID)
        return
      }
      const address = email.trim().toLowerCase()
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: address,
        options: {
          shouldCreateUser: true,
          ...(Platform.OS === 'web' ? { emailRedirectTo: window.location.origin } : {}),
        },
      })
      if (otpError) throw otpError
      setSentTo(address)
      setCode('')
      if (resend) setNotice('New code sent.')
      Haptics.selectionAsync()
      setTimeout(() => codeInput.current?.focus(), 50)
    } catch (e) {
      setError(isBypass(email) ? exchangeError(e) : sendError(e))
    } finally {
      setPending(null)
    }
  }

  async function verify() {
    if (!sentTo || code.length < 6) return
    setPending('verify')
    setError(null)
    setNotice(null)
    try {
      let { data, error: otpError } = await supabase.auth.verifyOtp({ email: sentTo, token: code, type: 'email' })
      if (otpError || !data.session) {
        // A first-time email gets the "Confirm signup" code, which checks as type 'signup'.
        ;({ data, error: otpError } = await supabase.auth.verifyOtp({ email: sentTo, token: code, type: 'signup' }))
      }
      if (otpError || !data.session) throw otpError ?? new Error('No session')
      // onAuthStateChange also fires SIGNED_IN; exchanging here keeps the button's spinner honest.
      await exchange(data.session.access_token)
      Haptics.selectionAsync()
    } catch (e) {
      exchanged.current = null
      setError(exchangeError(e))
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
    } finally {
      setPending(null)
    }
  }

  function toggleAllergy(name: string) {
    Haptics.selectionAsync()
    setAllergies((prev) => (prev.includes(name) ? prev.filter((a) => a !== name) : [...prev, name]))
  }

  function addOtherAllergy() {
    const name = normalizeAllergy(otherAllergy)
    if (name && !allergies.includes(name)) setAllergies((prev) => [...prev, name])
    setOtherAllergy('')
  }

  async function finish() {
    if (!verifiedId) return
    setPending('finish')
    setError(null)
    try {
      await saveAllergies(verifiedId, allergies)
      await signIn(verifiedId)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.')
      setPending(null)
    }
  }

  function changeEmail() {
    setSentTo(null)
    setCode('')
    setError(null)
    setNotice(null)
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior="padding" style={styles.container}>
        <View style={styles.hero}>
          <View style={styles.foods}>
            {FOODS.map((src, i) => (
              <View key={i} style={styles.food}>
                <Image source={src} style={styles.foodImage} resizeMode="contain" />
              </View>
            ))}
          </View>
          <Text style={type.title}>pAIntry</Text>
          <Text style={[type.body, styles.muted]}>Knows your kitchen, your body, and your budget.</Text>
        </View>

        {verifiedId ? (
          <View style={styles.form}>
            <View style={styles.copy}>
              <Text style={styles.heading}>Any food allergies?</Text>
              <Text style={[type.body, styles.muted]}>We’ll flag products that contain them.</Text>
            </View>
            <View style={styles.chips}>
              {[...COMMON_ALLERGIES, ...allergies.filter((a) => !(COMMON_ALLERGIES as readonly string[]).includes(a))].map(
                (name) => {
                  const on = allergies.includes(name)
                  return (
                    <Pressable
                      key={name}
                      onPress={() => toggleAllergy(name)}
                      style={[styles.chip, on && styles.chipOn]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                    >
                      {on ? <Ionicons name="checkmark" size={14} color={colors.greenInk} /> : null}
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{name}</Text>
                    </Pressable>
                  )
                },
              )}
            </View>
            <TextInput
              value={otherAllergy}
              onChangeText={setOtherAllergy}
              placeholder="Something else? e.g. strawberries"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              returnKeyType="done"
              onSubmitEditing={addOtherAllergy}
              onBlur={addOtherAllergy}
              style={styles.input}
              accessibilityLabel="Other allergy"
            />
            {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
            <Button onPress={finish} loading={pending === 'finish'}>
              <ButtonText>{allergies.length ? 'Continue' : 'No allergies — continue'}</ButtonText>
            </Button>
          </View>
        ) : sentTo ? (
          <View style={styles.form}>
            <View style={styles.copy}>
              <Text style={styles.heading}>Check your email</Text>
              <Text style={[type.body, styles.muted]}>We sent a code to {sentTo}.</Text>
            </View>
            <TextInput
              ref={codeInput}
              value={code}
              onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 10))}
              placeholder="••••••"
              placeholderTextColor={colors.faint}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              returnKeyType="go"
              onSubmitEditing={verify}
              style={[styles.input, styles.codeInput]}
              accessibilityLabel="Sign-in code"
            />
            {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
            {notice ? <Text style={[type.small, styles.notice]}>{notice}</Text> : null}
            <Button onPress={verify} disabled={code.length < 6} loading={pending === 'verify'}>
              <ButtonText>Sign in</ButtonText>
            </Button>
            <View style={styles.links}>
              <Pressable onPress={changeEmail} hitSlop={8} disabled={pending !== null}>
                <Text style={styles.link}>Use a different email</Text>
              </Pressable>
              <Pressable onPress={() => sendCode(true)} hitSlop={8} disabled={pending !== null}>
                <Text style={styles.link}>{pending === 'send' ? 'Sending…' : 'Resend code'}</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <View style={styles.form}>
            <View style={styles.copy}>
              <Text style={styles.heading}>Sign in with your email</Text>
              <Text style={[type.body, styles.muted]}>We’ll email you a code. No password needed.</Text>
            </View>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              placeholderTextColor={colors.faint}
              keyboardType="email-address"
              textContentType="emailAddress"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="go"
              onSubmitEditing={() => sendCode()}
              style={styles.input}
              accessibilityLabel="Email"
            />
            {error ? <Text style={[type.small, styles.error]}>{error}</Text> : null}
            <Button onPress={() => sendCode()} disabled={!canSend || pending !== null} loading={pending === 'send'}>
              <ButtonText>Email me a code</ButtonText>
            </Button>
            {Platform.OS === 'web' ? (
              <Button
                variant="secondary"
                onPress={google}
                disabled={pending !== null}
                loading={pending === 'google' || pending === 'verify'}
              >
                <ButtonIcon name="logo-google" />
                <ButtonText>Continue with Google</ButtonText>
              </Button>
            ) : null}
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 24, justifyContent: 'space-between' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  foods: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  food: {
    width: 60,
    height: 60,
    borderRadius: radius.pill,
    backgroundColor: colors.mint,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodImage: { width: 36, height: 36 },
  muted: { color: colors.muted, textAlign: 'center' },
  form: { gap: 12 },
  copy: { gap: 4, alignItems: 'center', marginBottom: 4 },
  heading: { fontSize: 17, fontWeight: '600', color: colors.ink },
  input: {
    height: 52,
    paddingHorizontal: 16,
    borderRadius: radius.sm,
    borderCurve: 'continuous',
    backgroundColor: colors.surface,
    fontSize: 17,
    color: colors.ink,
  },
  codeInput: { textAlign: 'center', fontSize: 22, fontWeight: '600', letterSpacing: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.mint, borderColor: colors.green },
  chipText: { fontSize: 15, color: colors.ink, textTransform: 'capitalize' },
  chipTextOn: { color: colors.greenInk, fontWeight: '600' },
  links: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, paddingTop: 4 },
  link: { fontSize: 15, fontWeight: '600', color: colors.greenInk },
  error: { color: colors.danger, textAlign: 'center' },
  notice: { color: colors.greenInk, textAlign: 'center' },
})
