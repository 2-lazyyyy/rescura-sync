import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator
} from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';

export default function SOSScreen() {
  const [locationNotes, setLocationNotes] = useState('');
  const [affectedCount, setAffectedCount] = useState('');
  const [urgentNeed, setUrgentNeed] = useState('Water');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const needOptions = ['Water', 'Food', 'Medical'];

  const submitSOS = async () => {
    if (!affectedCount.trim() || isNaN(Number(affectedCount))) {
      Alert.alert('Validation Error', 'Please enter a valid number of affected people.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('');

    try {
      // Step 1: Request live GPS location permission
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Permission to access live GPS location was denied.');
        setIsSubmitting(false);
        return;
      }

      // Fetch current device GPS coordinates
      let userLocation = await Location.getCurrentPositionAsync({});
      const currentLat = userLocation.coords.latitude;
      const currentLon = userLocation.coords.longitude;

      const payload = {
        location: locationNotes.trim() || `GPS (${currentLat.toFixed(4)}, ${currentLon.toFixed(4)})`,
        latitude: currentLat,
        longitude: currentLon,
        affected_people: parseInt(affectedCount, 10),
        affected_count: parseInt(affectedCount, 10),
        urgent_need: urgentNeed,
        status: 'pending'
      };

      // Perform Supabase table insert
      const { error } = await supabase
        .from('sos_alerts')
        .insert([payload]);

      if (error) {
        console.error('Supabase insert error:', error);
        Alert.alert('Broadcast Failed', 'Check your network connection and Supabase keys.');
        setStatusMessage('Error: Broadcast Failed. Check network connection or keys.');
      } else {
        Alert.alert('SOS Sent', 'Your emergency GPS signal has been received by the command center.');
        setStatusMessage('SOS Alert Broadcasted Successfully with Live GPS!');

        // Reset form inputs on success
        setLocationNotes('');
        setAffectedCount('');
        setUrgentNeed('Water');
      }
    } catch (err) {
      console.error('Error submitting SOS alert:', err);
      Alert.alert('Broadcast Failed', 'Check your network connection and Supabase keys.');
      setStatusMessage('Error: Check your network connection and Supabase keys.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerContainer}>
        <Text style={styles.badgeText}>RESCURA EMERGENCY</Text>
        <Text style={styles.titleText}>Broadcast SOS Alert</Text>
        <Text style={styles.subtitleText}>
          Broadcast live GPS emergency telemetry directly to situation command.
        </Text>
      </View>

      <View style={styles.formCard}>
        {/* Sector / Address Notes Input (Optional) */}
        <Text style={styles.label}>Location / Sector Notes (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Near Bago Bridge / Shelter 4"
          placeholderTextColor="#999"
          value={locationNotes}
          onChangeText={setLocationNotes}
        />

        {/* Affected People Input */}
        <Text style={styles.label}>Number of Affected People *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 50"
          placeholderTextColor="#999"
          keyboardType="numeric"
          value={affectedCount}
          onChangeText={setAffectedCount}
        />

        {/* Urgent Need Selector */}
        <Text style={styles.label}>Urgent Need Category *</Text>
        <View style={styles.pickerContainer}>
          {needOptions.map((option) => (
            <TouchableOpacity
              key={option}
              style={[
                styles.pickerButton,
                urgentNeed === option && styles.pickerButtonActive
              ]}
              onPress={() => setUrgentNeed(option)}
            >
              <Text
                style={[
                  styles.pickerButtonText,
                  urgentNeed === option && styles.pickerButtonTextActive
                ]}
              >
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Submit Button */}
        <TouchableOpacity
          style={[styles.broadcastButton, isSubmitting && styles.broadcastButtonDisabled]}
          onPress={submitSOS}
          disabled={isSubmitting}
        >
          {isSubmitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.broadcastButtonText}>BROADCAST GPS SOS</Text>
          )}
        </TouchableOpacity>

        {statusMessage ? (
          <Text style={[
            styles.statusText,
            statusMessage.startsWith('Error') ? styles.statusError : styles.statusSuccess
          ]}>
            {statusMessage}
          </Text>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0f172a',
    padding: 24,
    justifyContent: 'center'
  },
  headerContainer: {
    marginBottom: 24,
    alignItems: 'center'
  },
  badgeText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.5,
    marginBottom: 6
  },
  titleText: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8
  },
  subtitleText: {
    color: '#94a3b8',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20
  },
  formCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: '#334155'
  },
  label: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 12
  },
  input: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    padding: 12,
    color: '#f8fafc',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#475569'
  },
  pickerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20
  },
  pickerButton: {
    flex: 1,
    paddingVertical: 12,
    marginHorizontal: 4,
    backgroundColor: '#0f172a',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
    alignItems: 'center'
  },
  pickerButtonActive: {
    backgroundColor: '#dc2626',
    borderColor: '#ef4444'
  },
  pickerButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '600'
  },
  pickerButtonTextActive: {
    color: '#ffffff',
    fontWeight: 'bold'
  },
  broadcastButton: {
    backgroundColor: '#dc2626',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 8,
    shadowColor: '#dc2626',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4
  },
  broadcastButtonDisabled: {
    backgroundColor: '#7f1d1d'
  },
  broadcastButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1
  },
  statusText: {
    marginTop: 16,
    textAlign: 'center',
    fontSize: 14,
    fontWeight: '600'
  },
  statusSuccess: {
    color: '#4ade80'
  },
  statusError: {
    color: '#f87171'
  }
});
