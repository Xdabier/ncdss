# NCDSS - Nursing Clinical Decision Support System

Systeme d'Aide a la Decision Clinique pour Infirmieres

## Vue d'ensemble

NCDSS est une application client-serveur de gestion des urgences hospitalieres pour les etablissements de sante tunisiens. L'application fournit un support a la decision clinique base sur des regles et l'intelligence artificielle pour le triage, le traitement et le diagnostic aux urgences.

**Architecture:** Monorepo avec 3 workspaces npm

| Workspace | Role |
|-----------|------|
| **server** | Application Electron + serveur API Express + base de donnees SQLite |
| **client** | Application mobile/tablette React + Capacitor (Android/iOS) |
| **shared** | Types TypeScript et constantes de routes partagees |

## Fonctionnalites

### Infrastructure
- Authentification JWT (double token : access 15min + refresh 7 jours)
- Gestion des utilisateurs avec 5 roles hierarchiques
- Configuration dynamique des urgences (boxes, lits SAUV)
- Journal d'audit automatique pour la conformite medicale
- Interface utilisateur entierement en francais

### Gestion des patients (workflow complet)
- Inscription des patients avec motif de consultation
- Triage ABCDE complet (5 categories d'evaluation)
- Calcul automatique des scores cliniques (NEWS, GCS, qSOFA)
- Suggestion ESI et orientation automatique
- Prise en charge infirmiere (soins, vitaux, prescription)
- Workflow medecin (diagnostic, prescription, sortie)

### Aide a la decision clinique
- Extraction de signes cliniques depuis les evaluations ABCDE
- Correspondance automatique avec la base de pathologies
- Suggestion d'interventions infirmieres et medicales
- Determination de l'orientation (SAUV, Medical, Chirurgical, Trauma)
- Pre-diagnostic IA via LLM local (Qwen3, hors-ligne, GPU)

### Planification et suivi
- Planning hebdomadaire des infirmieres (inscription, triage, soins)
- Attribution medecin-box avec presets de garde tunisiens
- Tableau de suivi en temps reel des patients actifs
- Statistiques et tableaux de bord avec export CSV
- Gestion des files d'attente (5 files)

### Notifications
- Notifications en base de donnees (8 types)
- Alerte patient critique (ESI 1-2)
- Alerte fin de garde avec patients restants
- Detection des patients orphelins (medecin parti)
- Notification de triage complete pour infirmieres de soins

## Prerequis

- **Node.js** 18+ et npm
- **Windows**, macOS ou Linux
- Pour le developpement mobile : Android Studio et/ou Xcode (macOS)

## Installation

```bash
# Cloner le depot
git clone <repository-url>
cd ncdss

# Installer toutes les dependances (monorepo)
npm install --workspaces

# Compiler le package de types partages (requis avant server/client)
cd shared && npm run build && cd ..
```

## Configuration de l'environnement

Copier `.env.example` vers `.env` dans le dossier server et configurer les variables :

```bash
cp server/.env.example server/.env
```

### Variables d'environnement

| Variable | Defaut | Description |
|----------|--------|-------------|
| `PORT` | `3000` | Port du serveur API |
| `NODE_ENV` | `development` | Environnement (development/production) |
| `JWT_SECRET` | dev default | Secret pour les tokens d'acces (min 32 caracteres en production) |
| `JWT_REFRESH_SECRET` | dev default | Secret pour les tokens de rafraichissement |
| `CORS_ORIGINS` | `localhost` | Origines CORS autorisees (separees par virgules) |
| `LLAMA_MODELS_DIR` | `./models` | Repertoire contenant les modeles GGUF |
| `LLAMA_MODEL_PATH` | auto-detect | Chemin specifique vers un modele (optionnel) |
| `LLAMA_ENABLE_THINKING` | `true` | Activer le mode raisonnement Qwen3 |

**Important en production :** Les variables `JWT_SECRET` et `JWT_REFRESH_SECRET` sont obligatoires. Le serveur refuse de demarrer sans elles quand `NODE_ENV=production`.

## Demarrage

### Serveur (Electron)

```bash
cd server
npm run dev
```

Le serveur Electron demarrera et affichera :
- L'adresse IP locale (ex : `192.168.1.100:3000`)
- Le statut du serveur

**Identifiants par defaut :** `admin` / `admin123`

### Client (web)

```bash
cd client
npm run dev
```

Le client sera accessible sur `http://localhost:3001`

### Les deux simultanament (depuis la racine)

```bash
npm run dev
```

## Configuration du LLM (optionnel)

L'application fonctionne sans modele LLM (utilise les suggestions basees sur les regles). Pour activer le pre-diagnostic IA :

### Installation du modele

1. Creer le repertoire des modeles :
```bash
mkdir server/models
```

2. Telecharger un modele Qwen3 au format GGUF :
   - **Recommande :** `Qwen3-8B-Q4_K_M.gguf` (~5 Go, meilleur equilibre)
   - **Leger :** `Qwen3-4B-Q4_K_M.gguf` (~2.5 Go)

3. Placer le fichier `.gguf` dans `server/models/`

### GPU

Le modele utilise automatiquement le GPU si disponible :
- **NVIDIA** : CUDA
- **Apple** : Metal
- **AMD/Intel** : Vulkan

### Fonctionnalites Qwen3
- Mode raisonnement natif (`/think` et `/no_think`)
- Excellent support multilingue (terminologie medicale francaise)
- Sortie JSON structuree
- Inference hors-ligne complete (aucune connexion internet requise)

## Developpement mobile

```bash
cd client

# Synchroniser les assets web vers les projets natifs
npx cap sync

# Ouvrir dans Android Studio
npm run android

# Ouvrir dans Xcode (macOS uniquement)
npm run ios
```

## Commandes disponibles

### Racine (monorepo)
```bash
npm run dev              # Lance serveur et client
npm run build            # Build tous les packages
npm run lint             # Lint tous les fichiers TypeScript
npm run format           # Formate le code avec Prettier
```

### Serveur
```bash
cd server
npm run dev              # Mode developpement (Vite + Electron)
npm run build            # Build production
npm run rebuild          # Reconstruit better-sqlite3 pour Electron
npm run db:generate      # Generer une migration apres changement de schema
npm run db:push          # Pousser le schema directement (dev uniquement)
npm run db:studio        # Ouvrir l'interface de la base de donnees
```

### Client
```bash
cd client
npm run dev              # Serveur de developpement (port 3001)
npm run build            # Build production
npm run android          # Build et ouvrir Android Studio
npm run ios              # Build et ouvrir Xcode
```

## Roles utilisateurs

| Role | Acces |
|------|-------|
| **SUPER_ADMIN** | Acces total au systeme, gestion de tous les utilisateurs |
| **ADMIN** | Configuration ER, gestion utilisateurs (sauf SUPER_ADMIN), attributions boxes, donnees de reference |
| **NURSE_SUPERVISOR** | Planning hebdomadaire des infirmieres, gestion des assignations |
| **NURSE** | Workflows cliniques (inscription, triage, soins) selon l'assignation du jour |
| **DOCTOR** | Diagnostic, prescriptions, auto-attribution de box, sortie patient |

## Base de donnees

### Tables (15)

| Table | Description |
|-------|-------------|
| `users` | Comptes utilisateurs avec hachage bcrypt |
| `refresh_tokens` | Tokens JWT de rafraichissement |
| `weekly_schedule` | Assignations quotidiennes des infirmieres |
| `er_configuration` | Configuration de la disposition des urgences |
| `boxes` | Boxes de traitement individuels |
| `box_assignments` | Attributions medecin-box par garde |
| `patients` | Dossiers patients (~50 colonnes) |
| `prescriptions` | Prescriptions medicamenteuses |
| `diagnoses` | Diagnostics patients |
| `ai_prediagnosis` | Resultats de pre-diagnostic IA |
| `presenting_complaints` | Catalogue des motifs de consultation |
| `clinical_pathologies` | Pathologies ABCDE avec interventions |
| `notifications` | Notifications utilisateurs |
| `sync_log` | Suivi de synchronisation |
| `audit_log` | Journal d'audit de conformite |

La base de donnees est creee automatiquement au premier demarrage.
Emplacement : `%APPDATA%/ncdss-server/ncdss-server.db` (Windows)

## Stack technique

| Couche | Technologie |
|--------|-------------|
| Desktop | Electron 28 |
| Mobile | Capacitor 5 (Android + iOS) |
| UI | React 18 + shadcn/ui + Tailwind CSS 3.4 |
| Etat | Zustand 4 |
| HTTP | Axios |
| Routage | React Router DOM 6 |
| Graphiques | Recharts 3 |
| API | Express 4 |
| Base de donnees | SQLite (better-sqlite3) + Drizzle ORM |
| Auth | bcryptjs + jsonwebtoken |
| LLM | node-llama-cpp 3 (Qwen3, hors-ligne, GPU) |
| Build | Vite 5 |
| Langage | TypeScript 5.3 (mode strict) |
| Excel | xlsx (SheetJS) |

## Depannage

### Erreur NODE_MODULE_VERSION (better-sqlite3)

```bash
# Depuis la racine du projet
npm rebuild better-sqlite3
```

### Connexion client-serveur

1. Verifier que le serveur est demarre et affiche une adresse IP
2. S'assurer que le client et le serveur sont sur le meme reseau
3. Verifier que le pare-feu autorise le port 3000
4. Entrer l'adresse au format `192.168.1.100:3000` (sans `http://`)

### Reconstruction pour Electron

```bash
cd server
npm run rebuild    # Reconstruit better-sqlite3 pour Electron
```

## Securite

- Mots de passe haches avec bcrypt (10 rounds de salt)
- Systeme JWT double token avec rafraichissement automatique
- Electron securise (contextIsolation, pas de nodeIntegration)
- Middleware d'audit avec redaction des champs sensibles
- Validation des entrees sur les endpoints API

**En production, vous devez :**
- Definir `JWT_SECRET` et `JWT_REFRESH_SECRET`
- Configurer `CORS_ORIGINS`
- Changer le mot de passe admin par defaut
- Activer HTTPS
- Verifier les permissions du fichier de base de donnees

## Conventions de code

- **TypeScript strict mode** active partout
- **Pas de type `any`** sauf necessite absolue
- **Interface utilisateur en francais** uniquement
- **Composants fonctionnels React** avec hooks
- **shadcn/ui + Tailwind CSS** (jamais de composants Ionic UI)
- **Drizzle ORM** pour toutes les operations de base de donnees
- **API_ROUTES** (`@ncdss/shared`) pour tous les appels API client
- **CLIENT_ROUTES** (`client/src/routes/`) pour toute la navigation

## Licence

MIT
