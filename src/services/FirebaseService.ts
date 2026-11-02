// src/services/FirebaseService.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  deleteUser,
  signOut,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyCiCqOSZ8VMbEKRKSEsiMIUiE96-HqcYGM",
  authDomain: "gsoftpass.firebaseapp.com",
  projectId: "gsoftpass",
  storageBucket: "gsoftpass.firebasestorage.app",
  messagingSenderId: "52714970576",
  appId: "1:52714970576:web:a56cb2db2215eb6fe0add5"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
const auth = getAuth(app);
const db = getFirestore(app);

export class FirebaseService {
  /**
   * Verifica si el usuario ya colocó sus credenciales reales de Firebase
   */
  static isConfigured(): boolean {
    return (
      firebaseConfig.apiKey !== 'TU_API_KEY' &&
      !firebaseConfig.apiKey.includes('TU_')
    );
  }

  /**
   * Registra al usuario en Firebase Auth usando el authHash (Zero-Knowledge:
   * jamás enviamos la Contraseña Maestra real al servidor) y guarda el blob AES-256.
   */
  static async registerUserVault(
    email: string,
    authHash: string,
    encryptedVault: string
  ): Promise<string> {
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      email,
      authHash.substring(0, 32)
    );
    const uid = userCredential.user.uid;

    await setDoc(doc(db, 'vaults', uid), {
      email,
      encryptedVault,
      updatedAt: Date.now(),
    });

    return uid;
  }

  /**
   * Inicia sesión en Firebase y descarga el blob cifrado con AES-256
   */
  static async loginAndFetchVault(
    email: string,
    authHash: string
  ): Promise<{ uid: string; encryptedVault: string | null }> {
    const userCredential = await signInWithEmailAndPassword(
      auth,
      email,
      authHash.substring(0, 32)
    );
    const uid = userCredential.user.uid;

    const snap = await getDoc(doc(db, 'vaults', uid));
    if (snap.exists()) {
      const data = snap.data();
      return { uid, encryptedVault: data.encryptedVault || null };
    }
    return { uid, encryptedVault: null };
  }

  /**
   * Sincroniza cualquier cambio de tu bóveda cifrada con Cloud Firestore
   */
  static async updateEncryptedVault(
    uid: string,
    email: string,
    encryptedVault: string
  ): Promise<void> {
    await setDoc(
      doc(db, 'vaults', uid),
      {
        email,
        encryptedVault,
        updatedAt: Date.now(),
      },
      { merge: true }
    );
  }

  /**
   * REQUISITO OBLIGATORIO DE GOOGLE PLAY STORE:
   * Elimina de forma permanente la bóveda en Firestore y la cuenta de Authentication.
   */
  static async deleteAccountAndVaultPermanently(uid: string): Promise<void> {
    await deleteDoc(doc(db, 'vaults', uid));
    if (auth.currentUser) {
      await deleteUser(auth.currentUser);
    }
  }

  static async logout(): Promise<void> {
    if (this.isConfigured()) {
      await signOut(auth);
    }
  }
}