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
  const [urgentNeed, setUrgentNeed] = useState('💧 Water');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [transmissionSuccess, setTransmissionSuccess] = useState(false);

  const needOptions = [
    { label: '💧 Water', key: 'Water' },
    { label: '🍱 Food', key: 'Food' },
    { label: '🚑 Medical', key: 'Medical' },
    { label: '⛺ Shelter', key: 'Shelter' }
  ];

  const submitSOS = async () => {
    if (!affectedCount.trim() || isNaN(Number(affectedCount))) {
      Alert.alert('Validation Required', 'Please enter a valid number of affected people.');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage('');
    setTransmissionSuccess(false);

    try {
      // Step 1: Request live GPS location permission
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Location Permission Denied', 'GPS permission is required to broadcast emergency telemetry.');
        setIsSubmitting(false);
        return;
      }

      // Fetch current device GPS coordinates
      let userLocation = await Location.getCurrentPositionAsync({});
      const currentLat = userLocation.coords.latitude;
      const currentLon = userLocation.coords.longitude;

      const categoryName = urgentNeed.replace(/[^a-zA-Z]/g, '').trim() || 'Water';

      const payload = {
        location: locationNotes.trim() || `GPS Lock (${currentLat.toFixed(4)}, ${currentLon.toFixed(4)})`,
        latitude: currentLat,
        longitude: currentLon,
        affected_people: parseInt(affectedCount, 10),
        affected_count: parseInt(affectedCount, 10),
        urgent_need: categoryName,
        status: 'pending'
      };

      // Perform Supabase table insert
      const { error } = await supabase
        .from('sos_alerts')
        .insert([payload]);

      if (error) {
        console.error('Supabase insert error:', error);
        Alert.alert('Transmission Warning', 'Check your network connection and Supabase keys.');
        setStatusMessage('Error: Broadcast Failed. Check network connection.');
      } else {
        setTransmissionSuccess(true);
        Alert.alert('🚨 SOS TELEMETRY SENT', 'Your emergency GPS coordinates have been received by the Situation Command Center.');
        setStatusMessage('Emergency Telemetry Transmitted Successfully!');

        // Reset form inputs on success
        setLocationNotes('');
        setAffectedCount('');
        setUrgentNeed('💧 Water');
      }
    } catch (err) {
      console.error('Error submitting SOS alert:', err);
      Alert.alert('Broadcast Failed', 'Check your network connection and Supabase keys.');
      setStatusMessage('Error: Connection issue while broadcasting SOS.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* High-Tech Emergency Header */}
      <View style={styles.headerContainer}>
        <View style={styles.radarBadgeRow}>
          <View style={styles.radarPulseDot} />
          <Text style={styles.badgeText}>RESCURA EMERGENCY NETWORK</Text>
        </View>
        <Text style={styles.titleText}>Civilian SOS Telemetry</Text>
        <Text style={styles.subtitleText}>
          Broadcast live GPS emergency coordinates directly to the Situation Awareness Command Center.
        </Text>
      </View>

      {/* GPS Lock Telemetry Box */}
      <View style={styles.gpsLockCard}>
        <Text style={styles.gpsLockIcon}>📡</Text>
        <View style={styles.gpsLockTextContainer}>
          <Text style={styles.gpsLockTitle}>GPS Telemetry Status</Text>
          <Text style={styles.gpsLockSub}>High-Precision Satellite Lock Ready</Text>
        </View>
        <View style={styles.gpsActivePill}>
          <Text style={styles.gpsActivePillText}>READY</Text>
        </View>
      </View>

      {/* Main Form Card */}
      <View style={styles.formCard}>
        {/* Sector / Address Notes Input */}
        <Text style={styles.label}>Location / Sector Notes (Optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Near Bago Bridge / Shelter Sector 4"
          placeholderTextColor="#64748b"
          value={locationNotes}
          onChangeText={setLocationNotes}
        />

        {/* Affected People Input */}
        <Text style={styles.label}>Number of Affected Civilians *</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. 25"
          placeholderTextColor="#64748b"
          keyboardType="numeric"
          value={affectedCount}
          onChangeText={setAffectedCount}
        />

        {/* Urgent Need Selector */}
        <Text style={styles.label}>Primary Need Category *</Text>
        <View style={styles.pickerContainer}>
          {needOptions.map((option) => (
            <TouchableOpacity
              key={option.key}
              style={[
                styles.pickerButton,
                urgentNeed === option.label && styles.pickerButtonActive
              ]}
              onPress={() => setUrgentNeed(option.label)}
            >
              <Text
                style={[
                  styles.pickerButtonText,
                  urgentNeed === option.label && styles.pickerButtonTextActive
                ]}
              >
                {option.label}
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
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.broadcastButtonText}>🚨 BROADCAST GPS SOS</Text>
          )}
        </TouchableOpacity>

        {/* Transmission Status Message */}
        {statusMessage ? (
          <View style={[
            styles.statusBanner,
            statusMessage.startsWith('Error') ? styles.statusBannerError : styles.statusBannerSuccess
          ]}>
            <Text style={styles.statusBannerText}>{statusMessage}</Text>
          </View>
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: '#0b0f19',
    padding: 20,
    justifyContent: 'center'
  },
  headerContainer: {
    marginBottom: 20,
    alignItems: 'center'
  },
  radarBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  radarPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
    marginRight: 6
  },
  badgeText: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2
  },
  titleText: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 6
  },
  subtitleText: {
    color: '#94a3b8',
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18
  },
  gpsLockCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(30, 41, 59, 0.6)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    marginBottom: 16
  },
  gpsLockIcon: {
    fontSize: 22,
    marginRight: 10
  },
  gpsLockTextContainer: {
    flex: 1
  },
  gpsLockTitle: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '700'
  },
  gpsLockSub: {
    color: '#38bdf8',
    fontSize: 11,
    marginTop: 2
  },
  gpsActivePill: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.4)'
  },
  gpsActivePillText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '800'
  },
  formCard: {
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    borderRadius: 18,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  label: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 10
  },
  input: {
    backgroundColor: '#1e293b',
    borderRadius: 10,
    padding: 14,
    color: '#f8fafc',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155'
  },
  pickerContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 18
  },
  pickerButton: {
    flex: 1,
    minWidth: '45%',
    paddingVertical: 12,
    backgroundColor: '#1e293b',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center'
  },
  pickerButtonActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderColor: '#ef4444'
  },
  pickerButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '700'
  },
  pickerButtonTextActive: {
    color: '#f87171',
    fontWeight: '800'
  },
  broadcastButton: {
    backgroundColor: '#dc2626',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 6,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 6
  },
  broadcastButtonDisabled: {
    backgroundColor: '#7f1d1d',
    opacity: 0.7
  },
  broadcastButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.8
  },
  statusBanner: {
    marginTop: 16,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center'
  },
  statusBannerSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)'
  },
  statusBannerError: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)'
  },
  statusBannerText: {
    color: '#f8fafc',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center'
  }
});
