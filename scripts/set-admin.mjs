import admin from 'firebase-admin';
import { createRequire } from 'module';

const serviceAccount = {
  type: "service_account",
  project_id: "campusconnect-fecb1",
  private_key_id: "8e23e3bdb8fa2ad45bdabc4d7901b40ebace928e",
  private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC5hFaW0GECJf1+\nr11/PyDH2lqncnAcd95D5tFkhG3zJ+TJyoQJgRz7RN9W7xxOUigJMFkAU8NMX915\nALqeCE9KBtU063BWc48VMqvl+OU9/QA0mW0eQaCEdq9BHJF7xEnrNgkZx3v98QpX\nUzNaQLAk2nYIEsNWTeySJZZCz7LAOoNPdqldCz6UoGLLxPZ/Si1vS94mXiW+7OWU\nMMHvP7LDPN/UgSw3C7/cpv4iXFHt4HUgSDDm5tq/8W64Bf2ar0SNCol8Ic7AAB1T\nbzdg9tMXz5LzCxIT/01Ri0QVe2Y1Ler4KBM7M4YAjcYVQJ+9avKtZQ56QWNpLKDW\neoWDlwKXAgMBAAECggEAFHqV3mcZVlXgQlRUc2ACG92wRSy+UH4w9Hjt43U09/MO\n7/GhmrT8gIZNSzjw/HpYPg9uu7kDZZJtjdZ1Q02yhv7zGTjmOTzfbh0eWbAcije8\nBpJrN7xR3l2Foh/ntWxpJoRcA9MADnvFwvcFw7BBYYgWIHUFyCio9Ucd67kmx85d\noXMFrJOxw8zjghSBgzzwwZZtylAwvbMf61TnfA5oAzfCBrOIRYphfOs/ouiAa8Ky\nt1Kbq+v1yK3bZJUkNHzjcLCXrukcSakxYkvMQmz25iSWIqzAZDWxm6w34kFmua1o\n3i/CCruHmXm10Hte5NJQ9AmMCLkLzapsJUOCKTiXSQKBgQDepvcO7AyZBn3sFhMv\nNxeqSNK/GQcDucq7lGNccKXEl0XSyf5RElIi1f5dvR9w5hPw4h9tdrZbked3drD/\nYBxvhTZShskTe2BhMRXYAoUy1sbnbqIfamNwWM+jMOATKS/7f7ziekJGod6h9l+/\nNEKcHcD8whbQMnVWMp2dhCp5rwKBgQDVTYQBJU8IFnQouFkP/dpdsXZ4vz6Al9Ar\npW7H4v7HLAa34tdk5giKdJg5IjGz/hTLFbghR+XXvv4gbc+c8rgPjmaX5fF8YKZ9\n9hw0tARXsPXVtK4yKgEAt1iCo46jortEQHgQF73ffccIuZ1mgBdg5iRXR1pYYIQ8\neqaFR8eHmQKBgQCyin7o515+w1bsnxMJNIt0kGr2tJIMacrpOmem8+npyEhEbJfT\n2PYmWyVbc9GnjcgFzL3Y4G4A5fIPuQzb6+1BfDgAW3cYeUHjDiJvEi5Pgy0C3pOA\nz6Ynq//s4797ffatHVSQ4+sLirfldpR21ehoGe/sf5Mdpqiy02nSqu4InwKBgHQj\n9NA65EFfGHhjh/rxGckSK5OrbfjOsIZTWXJ04ozIKBBP7z/9EIFy4r+ZIr8ChYfe\nl5dncnp6gBxgLj8i2Z1+x9XFWiuC5KSJMOpxajvlGrX13zNpM4qUShk3vR7UKGsN\nP1Jj2vqpnYnepxl8fT5BkWAEdejRBK95iNnhL39hAoGAFY+8Ky3dDO6wFFwlyODp\n1A818KE1h8ltyBQZieg/ZETEc/qpNW+tQgYpG86jRKMI4pw6DxjWN0IGTN2A/Mbb\nKrEa2g3wdhMwvWhWYXgZblakSNOL16ZgHQabz4ZpW0qscxAMbPG1Lrw7Trs1EJOM\nbyJQJncYtk/xXuZqBLuAv/c=\n-----END PRIVATE KEY-----\n",
  client_email: "firebase-adminsdk-fbsvc@campusconnect-fecb1.iam.gserviceaccount.com",
  client_id: "111728148774828817828",
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
};

admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

const uid = 'FOJdMCSiTkcYhzL7sgxXdmQ4P8D3';

await admin.firestore().collection('users').doc(uid).update({ role: 'admin' });
await admin.auth().setCustomUserClaims(uid, { role: 'admin' });

console.log('Done — user', uid, 'is now admin.');
process.exit(0);
