const config = {
  appId: 'com.mahistream.app',
  appName: 'MahiStream',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    GoogleAuth: {
      scopes: ['profile', 'email'],
      serverClientId: '',
      androidClientId: '',
    },
  },
};

module.exports = config;
