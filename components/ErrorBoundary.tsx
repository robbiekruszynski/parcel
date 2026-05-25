import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={s.root}>
        <Text style={s.title}>⚠ App crash</Text>
        <Text style={s.name}>{this.state.error.name}: {this.state.error.message}</Text>
        <ScrollView style={s.scroll}>
          <Text style={s.stack}>{this.state.error.stack}</Text>
        </ScrollView>
        <Pressable style={s.btn} onPress={() => this.setState({ error: null })}>
          <Text style={s.btnTxt}>Retry</Text>
        </Pressable>
      </View>
    );
  }
}

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#0e0e10', padding: 20, paddingTop: 60 },
  title: { fontFamily: 'BarlowCondensed_900Black', fontSize: 28, color: '#f87171', marginBottom: 8 },
  name:  { fontFamily: 'Rajdhani_600SemiBold', fontSize: 14, color: '#fca5a5', marginBottom: 12 },
  scroll:{ flex: 1, backgroundColor: '#13131a', borderRadius: 10, padding: 12, marginBottom: 16 },
  stack: { fontFamily: 'DMMono_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.5)', lineHeight: 16 },
  btn:   { backgroundColor: '#f87171', borderRadius: 10, padding: 14, alignItems: 'center' },
  btnTxt:{ fontFamily: 'Rajdhani_600SemiBold', fontSize: 15, color: '#0e0e10', fontWeight: '700' },
});
