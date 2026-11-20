// src/services/FirebaseService.ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  deleteUser,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
} from 'firebase/firestore';

// REEMPLAZA ESTOS VALORES CON LOS DE TU PROYECTO EN FIREBASE CONSOLE (Configuración del proyecto -> Tus apps):
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID
};

export interface CloudVaultDocument {
  uid: string;
  encryptedVault: string | null;
  encryptedTwoFASecret: string | null;
  twoFAEnabled: boolean;
  updatedAt: number;
}

export class FirebaseService {
  private static appInstance = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
  private static auth = getAuth(this.appInstance);
  private static db = getFirestore(this.appInstance);

  static isConfigured(): boolean {
    return (
      Boolean(firebaseConfig.apiKey) &&
      firebaseConfig.apiKey !== 'TU_API_KEY' &&
      !firebaseConfig.apiKey.includes('REEMPLAZAR') &&
      firebaseConfig.projectId !== 'tu-proyecto'
    );
  }

  static async ensureAuthenticated(email: string, authHash: string): Promise<string> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.auth.currentUser && this.auth.currentUser.email?.toLowerCase() === cleanEmail) {
      return this.auth.currentUser.uid;
    }
    try {
      const cred = await signInWithEmailAndPassword(this.auth, cleanEmail, authHash);
      return cred.user.uid;
    } catch (err: any) {
      if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
        const created = await createUserWithEmailAndPassword(this.auth, cleanEmail, authHash);
        return created.user.uid;
      }
      throw err;
    }
  }

  /**
   * Registra al usuario en Firebase. Si el correo ya existía en Firebase Auth,
   * inicia sesión con el mismo hash y actualiza/recupera su bóveda sin lanzar error.
   */
  static async registerUserVault(
    email: string,
    authHash: string,
    encryptedVault: string
  ): Promise<string> {
    const cleanEmail = email.trim().toLowerCase();
    let uid = '';

    try {
      const userCredential = await createUserWithEmailAndPassword(this.auth, cleanEmail, authHash);
      uid = userCredential.user.uid;
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        const existingCred = await signInWithEmailAndPassword(this.auth, cleanEmail, authHash);
        uid = existingCred.user.uid;
      } else {
        throw err;
      }
    }

    try {
      await setDoc(
        doc(this.db, 'vaults', uid),
        {
          email: cleanEmail,
          encryptedVault,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch {
      // Si las reglas de Firestore aún no están abiertas, no bloqueamos el registro
    }

    return uid;
  }

  /**
   * Inicia sesión en Firebase. Si la cuenta solo existía localmente y aún no subía a Firebase,
   * la registra automáticamente en la nube.
   */
  static async loginAndFetchVault(
    email: string,
    authHash: string,
    localEncryptedFallback?: string | null
  ): Promise<CloudVaultDocument> {
    const cleanEmail = email.trim().toLowerCase();
    let uid = '';

    try {
      const userCredential = await signInWithEmailAndPassword(this.auth, cleanEmail, authHash);
      uid = userCredential.user.uid;
    } catch (err: any) {
      // Si el usuario tenía su cuenta antes en modo local y acaba de activar Firebase, la subimos
      if (localEncryptedFallback && (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential')) {
        const created = await createUserWithEmailAndPassword(this.auth, cleanEmail, authHash);
        uid = created.user.uid;
        try {
          await setDoc(doc(this.db, 'vaults', uid), {
            email: cleanEmail,
            encryptedVault: localEncryptedFallback,
            updatedAt: Date.now(),
          });
        } catch {}
        return {
          uid,
          encryptedVault: localEncryptedFallback,
          encryptedTwoFASecret: null,
          twoFAEnabled: false,
          updatedAt: Date.now(),
        };
      }
      throw err;
    }

    try {
      const snap = await getDoc(doc(this.db, 'vaults', uid));
      if (snap.exists()) {
        const data = snap.data();
        return {
          uid,
          encryptedVault: data?.encryptedVault || localEncryptedFallback || null,
          encryptedTwoFASecret: data?.encryptedTwoFASecret || null,
          twoFAEnabled: Boolean(data?.twoFAEnabled && data?.encryptedTwoFASecret),
          updatedAt: data?.updatedAt || 0,
        };
      }
    } catch {
      // Si Firestore rechaza la lectura por reglas de seguridad, usamos el respaldo local sin fallar
    }

    return {
      uid,
      encryptedVault: localEncryptedFallback || null,
      encryptedTwoFASecret: null,
      twoFAEnabled: false,
      updatedAt: 0,
    };
  }

  static async fetchLatestCloudVault(
    uid: string,
    email: string,
    authHash?: string
  ): Promise<CloudVaultDocument | null> {
    if (!this.isConfigured()) return null;
    try {
      let targetUid = uid;
      if (authHash) {
        targetUid = await this.ensureAuthenticated(email, authHash);
      }
      const snap = await getDoc(doc(this.db, 'vaults', targetUid));
      if (!snap.exists()) return null;
      const data = snap.data();
      return {
        uid: targetUid,
        encryptedVault: data?.encryptedVault || null,
        encryptedTwoFASecret: data?.encryptedTwoFASecret || null,
        twoFAEnabled: Boolean(data?.twoFAEnabled && data?.encryptedTwoFASecret),
        updatedAt: data?.updatedAt || 0,
      };
    } catch {
      return null;
    }
  }

  static async updateEncryptedVault(
    uid: string,
    email: string,
    encryptedVault: string,
    authHash?: string
  ): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      let targetUid = uid;
      if (authHash) {
        targetUid = await this.ensureAuthenticated(email, authHash);
      }
      await setDoc(
        doc(this.db, 'vaults', targetUid),
        {
          email: email.trim().toLowerCase(),
          encryptedVault,
          updatedAt: Date.now(),
        },
        { merge: true }
      );
    } catch {}
  }

  static async updateCloudTwoFA(
    uid: string,
    email: string,
    encryptedTwoFASecret: string | null,
    authHash?: string
  ): Promise<boolean> {
    if (!this.isConfigured()) return false;
    try {
      let targetUid = this.auth.currentUser?.uid || uid;
      if (authHash) {
        targetUid = await this.ensureAuthenticated(email, authHash);
      }
      await setDoc(
        doc(this.db, 'vaults', targetUid),
        {
          email: email.trim().toLowerCase(),
          encryptedTwoFASecret: encryptedTwoFASecret || null,
          twoFAEnabled: Boolean(encryptedTwoFASecret),
          updatedAt: Date.now(),
        },
        { merge: true }
      );
      return true;
    } catch {
      return false;
    }
  }

  static async deleteAccountAndVaultPermanently(
    uid: string,
    email?: string,
    authHash?: string
  ): Promise<void> {
    if (!this.isConfigured()) return;
    try {
      let targetUid = uid;
      if (email && authHash) {
        targetUid = await this.ensureAuthenticated(email, authHash);
      }
      await deleteDoc(doc(this.db, 'vaults', targetUid));
      if (this.auth.currentUser) {
        await deleteUser(this.auth.currentUser);
      }
    } catch {}
  }

  static async logout(): Promise<void> {
    try {
      if (this.isConfigured()) {
        await signOut(this.auth);
      }
    } catch {}
  }
}