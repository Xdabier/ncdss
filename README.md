# NCDSS - Nursing Clinical Decision Support System

Système d'Aide à la Décision Clinique pour Infirmières

## 📋 Vue d'ensemble

NCDSS est une application client-serveur pour la gestion des urgences hospitalières, comprenant:

- **Server**: Application Electron + Express avec interface d'administration
- **Client**: Application mobile/tablette Ionic + Capacitor + React
- **Shared**: Types TypeScript partagés entre client et serveur

## 🏗️ Architecture

```
ncdss/
├── server/          # Electron + Express + SQLite
├── client/          # Ionic + Capacitor + React
└── shared/          # Types TypeScript partagés
```

## ✅ Fonctionnalités - Semaine 1

### Server (Electron)
- ✅ Interface UI affichant l'adresse IP du serveur
- ✅ Affichage du nombre de clients connectés
- ✅ Base de données SQLite avec Drizzle ORM
- ✅ API REST (Express) pour authentification et configuration
- ✅ Démarrage/arrêt du serveur via UI

### Client (Mobile/Tablette)
- ✅ Connexion au serveur via adresse IP
- ✅ Authentification utilisateur (login/logout)
- ✅ Dashboard adaptatif selon le rôle
- ✅ Configuration des urgences (admin uniquement)
- ✅ Interface responsive avec Tailwind CSS + shadcn UI

### Fonctionnalités techniques
- ✅ Authentification JWT
- ✅ Protocole de synchronisation de base
- ✅ Gestion des rôles utilisateurs
- ✅ Configuration dynamique de l'ER

## 🚀 Installation et démarrage

### Prérequis
- Node.js 18+ et npm
- Windows, macOS ou Linux

### Installation

```bash
# Cloner ou naviguer vers le répertoire du projet
cd ncdss

# Installer toutes les dépendances (monorepo)
npm install --workspaces

# Compiler le package shared
cd shared && npm run build && cd ..
```

### Démarrage du serveur

```bash
cd server
npm run dev
```

Le serveur Electron démarrera et affichera:
- L'adresse IP locale (ex: 192.168.1.100:3000)
- Le statut du serveur
- Les clients connectés

**Identifiants par défaut:**
- Username: `admin`
- Password: `admin123`

### Démarrage du client (web)

```bash
cd client
npm run dev
```

Le client sera accessible sur `http://localhost:3001`

### Pour compiler pour Android/iOS

```bash
cd client

# Synchroniser avec Capacitor
npx cap sync

# Pour Android
npm run android

# Pour iOS (macOS uniquement)
npm run ios
```

## 📱 Utilisation

### Connexion du client au serveur

1. Démarrer le serveur Electron
2. Noter l'adresse IP affichée (ex: `192.168.1.100:3000`)
3. Ouvrir le client
4. Entrer l'adresse IP du serveur
5. Se connecter avec les identifiants

### Rôles utilisateurs

- **SUPER_ADMIN**: Accès total, configuration système
- **ADMIN**: Configuration des urgences, gestion utilisateurs
- **NURSE**: Fonctions infirmières (à venir en semaine 2+)
- **DOCTOR**: Fonctions médicales (à venir)

## 🛠️ Technologies

### Server
- Electron 28
- Express.js
- Better-SQLite3 + Drizzle ORM
- React + TypeScript
- Tailwind CSS + shadcn UI
- JWT pour l'authentification

### Client
- React + TypeScript
- Ionic + Capacitor 5
- Tailwind CSS + shadcn UI (pas d'Ionic UI)
- Zustand pour la gestion d'état
- Axios pour les requêtes HTTP
- React Router

### Shared
- TypeScript 5
- Types partagés (User, Config, Sync, etc.)

## 📂 Structure du code

### Server

```
server/src/
├── main/               # Electron main process
│   ├── index.ts       # Point d'entrée Electron
│   ├── server.ts      # Configuration Express
│   └── preload.ts     # Bridge Electron
├── renderer/          # Interface UI React
│   ├── App.tsx
│   └── components/
├── api/
│   ├── routes/        # Routes Express
│   └── middleware/    # Auth middleware
├── database/
│   ├── schema.ts      # Schéma Drizzle
│   └── index.ts       # Connexion DB
└── utils/
    └── network.ts     # Utilitaires réseau
```

### Client

```
client/src/
├── pages/
│   ├── Login.tsx
│   ├── Dashboard.tsx
│   └── admin/
│       └── ERConfiguration.tsx
├── components/
│   ├── ui/            # Composants shadcn
│   └── ProtectedRoute.tsx
├── services/
│   ├── api.ts         # Client HTTP
│   ├── config.ts      # Configuration serveur
│   └── sync.ts        # Synchronisation
└── stores/
    └── auth.store.ts  # État Zustand
```

## 🔒 Sécurité

- Mots de passe hashés avec bcrypt
- Tokens JWT pour l'authentification
- Validation des entrées utilisateur
- CORS configuré

⚠️ **Note**: Le JWT secret par défaut doit être changé en production!

## 🗄️ Base de données

### Tables principales

- `users`: Utilisateurs et rôles
- `er_configuration`: Configuration des urgences
- `boxes`: Boxes médicaux/chirurgicaux
- `patients`: Patients (structure de base)
- `weekly_schedule`: Planning infirmier
- `sync_log`: Log de synchronisation
- `audit_log`: Audit trail

La base de données est créée automatiquement au premier démarrage avec:
- Un admin par défaut (admin/admin123)
- Une configuration ER par défaut

## 📝 Roadmap - Semaines suivantes

### Semaine 2: Gestion des patients
- Inscription des patients
- Système de triage
- Attribution des boxes

### Semaine 3: Workflow clinique
- Dossier patient complet
- Prescriptions et soins
- Intégration LLM pour aide à la décision

### Semaine 4: Optimisations
- Synchronisation avancée
- Gestion offline
- Notifications temps réel

### Semaine 5: Tests et déploiement
- Tests end-to-end
- Documentation complète
- Packaging et distribution

## 🤝 Développement

### Scripts disponibles

```bash
# Root (monorepo)
npm run dev              # Lance server et client
npm run build            # Build tous les packages

# Server
npm run dev              # Mode développement
npm run build            # Build production
npm run start            # Lance l'app Electron

# Client
npm run dev              # Serveur de développement
npm run build            # Build production
npm run android          # Build et ouvre Android Studio
npm run ios              # Build et ouvre Xcode
```

### Conventions de code

- **TypeScript strict mode** activé
- **Pas de type `any`** sauf nécessité absolue
- **UI en français uniquement**
- **Composants fonctionnels** avec hooks React
- **Drizzle ORM** pour toutes les opérations DB

## 📞 Support

Pour toute question ou problème, créer une issue sur le dépôt GitHub.

## 📄 License

MIT

---

**Développé avec Claude Code** 🤖
