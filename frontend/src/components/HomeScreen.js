import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import axios from 'axios';

const API_BASE = 'http://localhost:8000/api/resources';

export default function HomeScreen() {
  const [resources, setResources] = useState([]);

  useEffect(() => {
    fetchResources();
  }, []);

  const fetchResources = async () => {
    try {
      const response = await axios.get(API_BASE);
      setResources(response.data);
    } catch (error) {
      console.error('Failed to load resources', error);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Rescura Sync</Text>
      <FlatList
        data={resources}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.name}>{item.name}</Text>
            <Text>{item.category}</Text>
            <Text>{item.location}</Text>
            <Text>{item.available ? 'Available' : 'Unavailable'}</Text>
          </View>
        )}
      />
      <TouchableOpacity style={styles.button} onPress={fetchResources}>
        <Text style={styles.buttonText}>Refresh</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 16,
  },
  card: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  name: {
    fontSize: 18,
    fontWeight: '600',
  },
  button: {
    marginTop: 16,
    padding: 14,
    borderRadius: 10,
    backgroundColor: '#0f172a',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
