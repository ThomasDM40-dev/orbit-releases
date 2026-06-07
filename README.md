<p align="center">
  <img src="https://raw.githubusercontent.com/ThomasDM40-dev/orbit-releases/main/assets/banner.png" alt="Orbit Banner" width="100%"/>
</p>

<p align="center">
  <strong>🚀 Next-Gen Media Downloader & AI Studio</strong>
</p>

<p align="center">
  <a href="https://github.com/ThomasDM40-dev/orbit-releases/releases/latest"><img src="https://img.shields.io/github/v/release/ThomasDM40-dev/orbit-releases?style=for-the-badge&color=ff2a6d&label=Version" alt="Version"/></a>
  <a href="https://github.com/ThomasDM40-dev/orbit-releases/releases/latest"><img src="https://img.shields.io/github/downloads/ThomasDM40-dev/orbit-releases/total?style=for-the-badge&color=a855f7&label=Downloads" alt="Downloads"/></a>
  <img src="https://img.shields.io/badge/Platform-Windows-blue?style=for-the-badge&logo=windows&logoColor=white" alt="Platform"/>
  <img src="https://img.shields.io/badge/License-Proprietary-gray?style=for-the-badge" alt="License"/>
</p>

<p align="center">
  <a href="https://github.com/ThomasDM40-dev/orbit-releases/releases/latest">
    <img src="https://img.shields.io/badge/⬇️_Télécharger-Orbit_Setup.exe-ff2a6d?style=for-the-badge&logo=data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSJub25lIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjIiPjxwYXRoIGQ9Ik0yMSAxNXY0YTIgMiAwIDAgMS0yIDJINWEyIDIgMCAwIDEtMi0ydi00Ii8+PHBvbHlsaW5lIHBvaW50cz0iNyAxMCAxMiAxNSAxNyAxMCIvPjxsaW5lIHgxPSIxMiIgeTE9IjE1IiB4Mj0iMTIiIHkyPSIzIi8+PC9zdmc+" alt="Download"/>
  </a>
</p>

---

## ✨ Qu'est-ce qu'Orbit ?

**Orbit** est une application desktop tout-en-un qui combine un **téléchargeur multimédia puissant**, un **convertisseur audio/vidéo**, et un **studio d'IA** — le tout dans une interface premium au design "Liquid Glass".

Pensez à un mélange entre **JDownloader**, **HandBrake**, **Flowframes** et **Topaz Video AI**… mais gratuit, open-source, et avec une interface magnifique.

<br/>

## 🎯 Fonctionnalités

### ⬇️ Téléchargeur Multimédia
- Téléchargement depuis **1000+ sites** (YouTube, Twitter/X, TikTok, Instagram, Twitch, SoundCloud...)
- File d'attente intelligente avec **téléchargements parallèles**
- Choix de la qualité (4K, 1080p, 720p, audio uniquement)
- Extraction audio MP3/FLAC/WAV depuis n'importe quelle vidéo
- Miniatures et métadonnées automatiques
- 3 modes d'affichage : grille, liste, compact

### 🎬 Convertisseur & Tags
- Conversion entre **tous les formats** : MP4, MKV, AVI, MOV, MP3, FLAC, WAV, OGG...
- Éditeur de **tags ID3** (titre, artiste, album, pochette)
- Prévisualisation audio intégrée
- Support du drag & drop

### ⚡ Interpolateur IA (Style Flowframes / Topaz Video)
- **Interpolation vidéo** par IA pour transformer n'importe quelle vidéo en 60FPS, 120FPS ou 240FPS
- Moteur **RIFE-NCNN** (accélération GPU Vulkan — NVIDIA, AMD, Intel)
- Multiplicateurs : x2, x4, x8
- Préréglages rapides : Anime 60FPS, Film Fluide, Slow Motion, Discord GIF
- Console de logs en temps réel avec barre de progression
- Téléchargement automatique du moteur IA (~30MB) à la première utilisation

### 📡 Abonnements
- Surveillance automatique de chaînes YouTube
- Notification et téléchargement automatique des nouvelles vidéos
- Gestion complète des abonnements

### 🎮 Discord Rich Presence
- Statut dynamique selon l'onglet actif
- Compteur de téléchargements en temps réel
- Boutons "Télécharger Orbit" et "GitHub" sur votre profil
- Temps de session affiché

<br/>

## 📸 Aperçu

| Téléchargements | Convertisseur | Interpolateur IA |
|:---:|:---:|:---:|
| File d'attente intelligente | Conversion tous formats | RIFE-NCNN 60FPS |
| Qualité jusqu'au 4K | Tags ID3 & pochette | Barre de progression |
| 1000+ sites supportés | Drag & drop | Préréglages rapides |

<br/>

## 💻 Installation

### Prérequis
- **Windows 10/11** (64-bit)
- **GPU** compatible Vulkan (recommandé pour l'interpolation IA)
- Connexion Internet (pour le premier lancement)

### Installation rapide

1. **Téléchargez** le dernier installateur :

   👉 [**Orbit Setup.exe**](https://github.com/ThomasDM40-dev/orbit-releases/releases/latest)

2. **Lancez** l'installateur et suivez les instructions
3. **C'est prêt !** Orbit télécharge automatiquement FFmpeg et yt-dlp au premier démarrage

### Mise à jour
Orbit se met à jour automatiquement ! Vous pouvez aussi vérifier manuellement :
> **Paramètres** → **À Propos** → **🔍 Vérifier les mises à jour**

<br/>

## 🛠️ Stack Technique

| Technologie | Utilisation |
|:---|:---|
| **Electron** | Framework desktop cross-platform |
| **React 19** | Interface utilisateur |
| **TypeScript** | Typage statique |
| **Tailwind CSS 4** | Styling utility-first |
| **Framer Motion** | Animations fluides |
| **yt-dlp** | Moteur de téléchargement (1000+ sites) |
| **FFmpeg** | Conversion audio/vidéo |
| **RIFE-NCNN** | Interpolation IA (GPU Vulkan) |
| **discord-rpc** | Discord Rich Presence |
| **electron-updater** | Mises à jour automatiques |

<br/>

## 📦 Structure du Projet

```
orbit/
├── main.js              # Process principal Electron
├── preload.js           # Bridge IPC sécurisé
├── src/
│   ├── App.tsx           # Application principale
│   ├── components/
│   │   ├── DownloadInterface.tsx   # Téléchargeur
│   │   ├── Converter.tsx           # Convertisseur & Tags
│   │   ├── AIInterpolator.tsx      # Interpolateur IA
│   │   ├── Subscriptions.tsx       # Abonnements
│   │   ├── SettingsModal.tsx       # Paramètres
│   │   └── ImportModal.tsx         # Import fichiers
│   └── index.css         # Styles globaux & thèmes
├── public/
│   └── icon.ico          # Icône application
└── package.json          # Configuration & build
```

<br/>

## ⌨️ Raccourcis Clavier

| Raccourci | Action |
|:---|:---|
| `Ctrl + V` | Coller une URL et lancer le téléchargement |
| `Ctrl + O` | Ouvrir le dossier de téléchargements |
| `Ctrl + ,` | Ouvrir les paramètres |
| `Ctrl + I` | Importer un fichier |
| `Ctrl + T` | Terminal intégré |
| `Escape` | Fermer la fenêtre active |

<br/>

## 🗺️ Roadmap

- [x] Téléchargeur multimédia (1000+ sites)
- [x] Convertisseur audio/vidéo
- [x] Éditeur de tags ID3
- [x] Système d'abonnements
- [x] Interpolateur IA (RIFE-NCNN)
- [x] Discord Rich Presence
- [x] Mises à jour automatiques
- [x] Système de logs
- [ ] Séparateur de pistes audio (Vocal Remover / Stems)
- [ ] Générateur de sous-titres (OpenAI Whisper)
- [ ] Smart Compressor (Discord / WhatsApp)
- [ ] Upscaling vidéo IA (Real-ESRGAN)
- [ ] Bibliothèque & lecteur intégré
- [ ] Support macOS & Linux

<br/>

## 📄 Changelog

### v0.2.8 — *7 Juin 2026*
- ⚡ Interpolateur IA avec RIFE-NCNN et barre de progression
- 🎮 Discord Rich Presence dynamique
- 🔄 Bouton "Vérifier les mises à jour" dans À Propos
- 🎨 Suppression des scrollbars horizontales
- 🐛 Fix crash ENOENT sur RIFE
- 🐛 Fix releases GitHub (Draft → Published)

### v0.1.6 — *7 Juin 2026*
- 🎨 Design "Liquid Glass" complet
- ✨ Sélection de texte désactivée
- 🧹 Suppression de la barre de statut

### v0.1.0 — *6 Juin 2026*
- 🎉 Première release publique
- ⬇️ Téléchargeur multimédia
- 🎬 Convertisseur & éditeur de tags
- 📡 Système d'abonnements

<br/>

## 🤝 Contribuer

Ce projet est actuellement en développement actif. Les contributions, suggestions et rapports de bugs sont les bienvenus !

1. Ouvrez une **Issue** pour signaler un bug ou proposer une fonctionnalité
2. Consultez les **Logs** : `Paramètres → À Propos → Voir les Logs`

<br/>

## 📝 Licence

Orbit est un projet propriétaire. Tous droits réservés.

<br/>

---

<p align="center">
  <strong>Développé avec ❤️ et beaucoup de ☕</strong>
  <br/>
  <sub>© 2026 Orbit — ThomasDM40-dev</sub>
</p>
