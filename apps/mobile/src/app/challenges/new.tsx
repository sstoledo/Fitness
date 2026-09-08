import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CreateChallengeDtoSchema, type ChallengeType } from '@fitness/contracts';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AuthFormField } from '@/components/auth-form-field';
import { OfflineBanner } from '@/components/offline-banner';
import { PrimaryButton } from '@/components/primary-button';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { ApiRequestError } from '@/lib/api';
import { createChallenge } from '@/lib/challenges';

/**
 * Structural typing for the zod schema (mobile does not declare zod; schemas
 * come from @fitness/contracts — same pattern as lib/form-validation.ts).
 */
interface SchemaIssue {
  path: PropertyKey[];
  message: string;
}

interface ObjectSchema {
  safeParse: (value: unknown) =>
    | { success: true }
    | { success: false; error: { issues: SchemaIssue[] } };
}

const CreateChallengeSchema: ObjectSchema = CreateChallengeDtoSchema;

const CHALLENGE_TYPES: ChallengeType[] = ['step', 'run', 'walk', 'bike'];

const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

interface FormState {
  name: string;
  type: ChallengeType;
  startDate: string;
  endDate: string;
}

type FieldErrors = Partial<Record<keyof FormState, string>>;

function toDateInput(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function addDays(dateInput: string, days: number): string {
  const base = DATE_INPUT_PATTERN.test(dateInput) ? new Date(`${dateInput}T00:00:00`) : new Date();
  base.setDate(base.getDate() + days);
  return toDateInput(base);
}

function isRealDate(dateInput: string): boolean {
  if (!DATE_INPUT_PATTERN.test(dateInput)) return false;
  return !Number.isNaN(new Date(`${dateInput}T00:00:00`).getTime());
}

/** Converts a YYYY-MM-DD input into the ISO datetime the API contract expects. */
function toIso(dateInput: string): string {
  return `${dateInput}T00:00:00.000Z`;
}

/**
 * Client-side validation mirrors CreateChallengeDtoSchema so errors surface
 * before submission: required name, valid calendar dates, and endDate after
 * startDate (the schema-level refine, surfaced on the endDate field).
 */
function validateForm(form: FormState): FieldErrors {
  const errors: FieldErrors = {};

  if (form.name.trim().length === 0) {
    errors.name = 'Name is required.';
  }
  if (!isRealDate(form.startDate)) {
    errors.startDate = 'Use a valid date (YYYY-MM-DD).';
  }
  if (!isRealDate(form.endDate)) {
    errors.endDate = 'Use a valid date (YYYY-MM-DD).';
  }

  const result = CreateChallengeSchema.safeParse({
    name: form.name.trim(),
    type: form.type,
    startDate: toIso(form.startDate),
    endDate: toIso(form.endDate),
  });
  if (!result.success) {
    for (const issue of result.error.issues) {
      const field = issue.path[0];
      if (field === 'name' || field === 'type' || field === 'startDate' || field === 'endDate') {
        errors[field] = errors[field] ?? issue.message;
      } else {
        // Schema-level refine (endDate must be after startDate) has no path.
        errors.endDate = errors.endDate ?? issue.message;
      }
    }
  }

  return errors;
}

function submitErrorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  return 'Could not reach the server. Check your connection and try again.';
}

export default function NewChallengeScreen() {
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<FormState>({
    name: '',
    type: 'step',
    startDate: toDateInput(new Date()),
    endDate: addDays(toDateInput(new Date()), 7),
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const mutation = useMutation({
    mutationFn: createChallenge,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['challenges'] });
      router.back();
    },
  });

  const update = <K extends keyof FormState>(field: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = () => {
    const errors = validateForm(form);
    setFieldErrors(errors);
    if (Object.values(errors).some(Boolean)) return;
    mutation.mutate({
      name: form.name.trim(),
      type: form.type,
      startDate: toIso(form.startDate),
      endDate: toIso(form.endDate),
    });
  };

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScreenHeader title="New Challenge" />
        <OfflineBanner />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
            <AuthFormField
              label="Name"
              value={form.name}
              onChangeText={(value) => update('name', value)}
              placeholder="Morning Steps Crew"
              autoCapitalize="words"
              error={fieldErrors.name}
            />

            <View style={styles.fieldGroup}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                Type
              </ThemedText>
              <View style={styles.typeRow}>
                {CHALLENGE_TYPES.map((type) => {
                  const selected = form.type === type;
                  return (
                    <Pressable
                      key={type}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      onPress={() => update('type', type)}
                      style={[
                        styles.typeChip,
                        {
                          backgroundColor: selected ? theme.accent : theme.backgroundElement,
                          borderColor: selected ? theme.accent : theme.backgroundSelected,
                        },
                      ]}>
                      <ThemedText
                        type="smallBold"
                        style={{ color: selected ? theme.background : theme.text }}>
                        {type}
                      </ThemedText>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <AuthFormField
              label="Start date"
              value={form.startDate}
              onChangeText={(value) => update('startDate', value)}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              error={fieldErrors.startDate}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => update('startDate', toDateInput(new Date()))}
              style={({ pressed }) => [styles.presetLink, { opacity: pressed ? 0.6 : 1 }]}>
              <ThemedText type="smallBold" themeColor="accent">
                Start today
              </ThemedText>
            </Pressable>

            <AuthFormField
              label="End date"
              value={form.endDate}
              onChangeText={(value) => update('endDate', value)}
              placeholder="YYYY-MM-DD"
              autoCapitalize="none"
              keyboardType="numbers-and-punctuation"
              error={fieldErrors.endDate}
            />
            <View style={styles.presetRow}>
              {[7, 14, 30].map((days) => (
                <Pressable
                  key={days}
                  accessibilityRole="button"
                  onPress={() => update('endDate', addDays(form.startDate, days))}
                  style={({ pressed }) => [styles.presetLink, { opacity: pressed ? 0.6 : 1 }]}>
                  <ThemedText type="smallBold" themeColor="accent">
                    +{days} days
                  </ThemedText>
                </Pressable>
              ))}
            </View>

            {mutation.isError ? (
              <ThemedText type="small" style={styles.submitError}>
                {submitErrorMessage(mutation.error)}
              </ThemedText>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>

        <PrimaryButton
          label="Create challenge"
          onPress={handleSubmit}
          loading={mutation.isPending}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.three,
    maxWidth: 800,
  },
  flex: {
    flex: 1,
  },
  form: {
    gap: Spacing.three,
    paddingBottom: Spacing.four,
  },
  fieldGroup: {
    gap: Spacing.two,
  },
  typeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  typeChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  presetLink: {
    alignSelf: 'flex-start',
    marginTop: -Spacing.two,
  },
  presetRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    marginTop: -Spacing.two,
  },
  submitError: {
    color: '#F87171',
  },
});
