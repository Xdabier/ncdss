# 🚀 Guide de démarrage rapide - NCDSS

## Installation (5 minutes)

```bash
# 1. Installer les dépendances de tous les packages
npm install --workspaces

# 2. Compiler le package shared
cd shared && npm run build && cd ..
```

## Démarrage serveur (1 minute)

```bash
cd server
npm run dev
```

✅ Le serveur Electron s'ouvre automatiquement
✅ La base de données est créée avec l'admin par défaut
✅ L'adresse IP s'affiche dans l'interface

**Note l'adresse IP affichée** (ex: `192.168.1.100:3000`)

## Démarrage client web (1 minute)

```bash
# Dans un nouveau terminal
cd client
npm run dev
```

Le client s'ouvre sur `http://localhost:3001`

## Connexion

1. **Première fois**: Entrer l'adresse IP du serveur
   → Ex: `192.168.1.100:3000`

2. **Login avec le compte admin**:
   - Username: `admin`
   - Password: `admin123`

3. **Dashboard**: Vous êtes connecté!

## Tester la configuration ER

1. Dans le Dashboard, cliquer sur **"Configuration des Urgences"**
2. Modifier les nombres de boxes
3. Cliquer sur **"Sauvegarder"**
4. Les modifications sont enregistrées dans la base de données

## Développement Android/iOS

```bash
cd client

# Première fois: installer Capacitor
npm install -g @capacitor/cli

# Synchroniser le code
npx cap sync

# Ouvrir dans Android Studio
npx cap open android

# Ouvrir dans Xcode (macOS uniquement)
npx cap open ios
```

## Troubleshooting

### Le client ne peut pas se connecter au serveur

- ✅ Vérifier que le serveur est démarré
- ✅ Vérifier l'adresse IP (elle peut changer)
- ✅ Vérifier le firewall Windows/macOS
- ✅ S'assurer d'être sur le même réseau

### Erreur de compilation TypeScript

```bash
# Nettoyer et réinstaller
rm -rf node_modules package-lock.json
npm install
```

### Base de données corrompue

Supprimer le fichier de base de données:
- Windows: `%APPDATA%\ncdss-server\ncdss-server.db`
- macOS: `~/Library/Application Support/ncdss-server/ncdss-server.db`
- Linux: `~/.config/ncdss-server/ncdss-server.db`

Le serveur recrée la DB au prochain démarrage.

## Prochaines étapes

Consultez le fichier `README.md` pour:
- Architecture complète
- Documentation de l'API
- Roadmap des fonctionnalités
- Conventions de développement

---

Bon développement! 🏥
