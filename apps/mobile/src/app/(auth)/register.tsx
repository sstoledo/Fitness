import { RegisterDtoSchema } from '@fitness/contracts';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthFormField } from '@/components/auth-form-field';
import { OfflineBanner } from '@/components/offline-banner';
import { PrimaryButton } from '@/components/primary-button';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { ApiRequestError, NetworkRequestError } from '@/lib/api';
import { validateField } from '@/lib/form-validation';
import { useAppStore } from '@/store/useAppStore';

const FORM_ERROR_COLOR = '#F87171';

export default function RegisterScreen() {
  const registerAccount = useAppStore((state) => state.registerAccount);
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const errors = {
      name: validateField(RegisterDtoSchema.shape.name, name.trim(), () => 'Enter your display name.'),
      email: validateField(RegisterDtoSchema.shape.email, email, () => 'Enter a valid email address.'),
      password: validateField(
        RegisterDtoSchema.shape.password,
        password,
        () => 'Password must be at least 8 characters.',
      ),
      confirmPassword:
        confirmPassword.length === 0
          ? 'Confirm your password.'
          : confirmPassword !== password
            ? 'Passwords do not match.'
            : undefined,
    };
    setFieldErrors(errors);
    return Object.values(errors).every((error) => error === undefined);
  };

  const handleSubmit = async () => {
    setFormError(null);
    if (!validate()) return;

    setSubmitting(true);
    try {
      await registerAccount({ name: name.trim(), email: email.trim().toLowerCase(), password });
      router.replace('/');
    } catch (error) {
      if (error instanceof NetworkRequestError || error instanceof ApiRequestError) {
        setFormError(error.message);
      } else {
        setFormError('Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ThemedView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboard}>
        <SafeAreaView style={styles.safeArea}>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            <View style={styles.header}>
              <ThemedText type="title" style={styles.title}>
                Create your account
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                Start competing on step challenges with your friends.
              </ThemedText>
            </View>

            {/* Network-level failures surface here; submitting the form is the retry. */}
            <OfflineBanner />

            <View style={styles.form}>
              <AuthFormField
                label="Display name"
                value={name}
                onChangeText={setName}
                error={fieldErrors.name}
                placeholder="How friends will see you"
                autoCapitalize="words"
                autoComplete="name"
                textContentType="name"
                returnKeyType="next"
              />
              <AuthFormField
                label="Email"
                value={email}
                onChangeText={setEmail}
                error={fieldErrors.email}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="next"
              />
              <AuthFormField
                label="Password"
                value={password}
                onChangeText={setPassword}
                error={fieldErrors.password}
                placeholder="At least 8 characters"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="next"
              />
              <AuthFormField
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                error={fieldErrors.confirmPassword}
                placeholder="Repeat your password"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              {formError ? (
                <Text style={styles.formError}>{formError}</Text>
              ) : null}
              <PrimaryButton label="Create account" onPress={handleSubmit} loading={submitting} />
            </View>

            <View style={styles.footer}>
              <ThemedText type="small" themeColor="textSecondary">
                Already have an account?
              </ThemedText>
              <Link href="/(auth)/login" asChild>
                <Pressable>
                  <ThemedText type="smallBold" themeColor="accent">
                    Sign in
                  </ThemedText>
                </Pressable>
              </Link>
            </View>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  keyboard: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: Spacing.four,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.four,
    maxWidth: MaxContentWidth,
    width: '100%',
    alignSelf: 'center',
  },
  header: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 34,
    lineHeight: 40,
  },
  form: {
    gap: Spacing.three,
  },
  formError: {
    color: FORM_ERROR_COLOR,
    fontSize: 14,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.one,
  },
});
