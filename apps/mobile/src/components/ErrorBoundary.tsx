import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, space, type as t } from '../theme/tokens';
import { hi } from '../i18n/hi';

interface Props {
  children: React.ReactNode;
}
interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * H3: App-wide error boundary — catches JS crashes and shows a Hindi retry screen
 * instead of a white screen. Used in App.tsx as the outermost wrapper.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): React.ReactNode {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <Text style={styles.emoji}>⚠️</Text>
          <Text style={styles.title}>{hi.common.somethingWrong}</Text>
          <Text style={styles.detail}>
            {this.state.error?.message ?? ''}
          </Text>
          <Pressable style={styles.retryBtn} onPress={this.handleRetry}>
            <Text style={styles.retryText}>{hi.common.retry}</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: space[6],
  },
  emoji: { fontSize: 48, marginBottom: space[4] },
  title: {
    fontSize: t.lg,
    fontWeight: '700',
    color: colors.ink,
    marginBottom: space[2],
    textAlign: 'center',
  },
  detail: {
    fontSize: t.sm,
    color: colors.ink3,
    textAlign: 'center',
    marginBottom: space[6],
  },
  retryBtn: {
    backgroundColor: colors.g700,
    borderRadius: radius.md,
    paddingVertical: space[3],
    paddingHorizontal: space[6],
    minHeight: 48,
    justifyContent: 'center',
  },
  retryText: {
    color: colors.white,
    fontWeight: '700',
    fontSize: t.base,
  },
});
