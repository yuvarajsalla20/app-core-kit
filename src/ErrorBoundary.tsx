import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { friendlyMessage } from './messages';
import { reportError, scrub } from './report';

export interface ErrorBoundaryColors {
  bg: string;
  text: string;
  muted: string;
  accent: string;
}

const DEFAULT_COLORS: ErrorBoundaryColors = { bg: '#0B0B0C', text: '#F5F5F7', muted: '#9A9AA0', accent: '#5B8CFF' };

interface Props {
  /** Names the screen in crash reports, like "home". */
  where: string;
  children: ReactNode;
  colors?: Partial<ErrorBoundaryColors>;
  /** Replaces the built-in screen. Call `reset` to try the content again. */
  fallback?: (error: unknown, reset: () => void) => ReactNode;
  /** Runs when the person taps "Try again", before the content is shown again (for example, to clear cached state). */
  onReset?: () => void;
}

interface State {
  error: unknown;
}

/** Catches a crash while drawing its children, reports it, and shows a calm "Try again" screen instead of a dead app. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error('Unknown error') };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    reportError(this.props.where, error, { componentStack: scrub(info.componentStack ?? '').slice(0, 500) });
  }

  reset = () => {
    try {
      this.props.onReset?.();
    } catch (e) {
      reportError(this.props.where, e); // a broken onReset must not leave the person stuck on this screen
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (error === null) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    const c = { ...DEFAULT_COLORS, ...this.props.colors };
    return (
      <View style={[styles.screen, { backgroundColor: c.bg }]} accessibilityRole="alert">
        <Text style={[styles.title, { color: c.text }]}>Something went wrong</Text>
        <Text style={[styles.detail, { color: c.muted }]}>{friendlyMessage(error)}</Text>
        <Pressable onPress={this.reset} accessibilityRole="button" style={[styles.button, { borderColor: c.accent }]}>
          <Text style={[styles.buttonText, { color: c.accent }]}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  title: { fontSize: 20, fontWeight: '600' },
  detail: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  button: { marginTop: 12, borderWidth: 1, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 28 },
  buttonText: { fontSize: 16, fontWeight: '600' },
});
