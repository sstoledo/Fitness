import { useRouter } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

interface ScreenHeaderProps {
  title: string;
}

/**
 * Shared header for stack screens (headerShown is false app-wide): a back
 * affordance on the leading edge plus the screen title.
 */
export function ScreenHeader({ title }: ScreenHeaderProps) {
  const router = useRouter();

  return (
    <ThemedView style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Go back"
        onPress={() => router.back()}
        hitSlop={12}
        style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}>
        <ThemedText type="smallBold" themeColor="accent">
          ‹ Back
        </ThemedText>
      </Pressable>
      <ThemedText type="default" style={styles.title}>
        {title}
      </ThemedText>
      <ThemedView style={styles.trailing} />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingVertical: Spacing.two,
  },
  back: {
    minWidth: 64,
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  trailing: {
    minWidth: 64,
    backgroundColor: 'transparent',
  },
});
