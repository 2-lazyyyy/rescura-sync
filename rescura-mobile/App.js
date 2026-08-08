import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet } from 'react-native';
import SOSScreen from './src/screens/SOSScreen';

export default function App() {
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0f172a" />
      <SOSScreen />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a'
  }
});
