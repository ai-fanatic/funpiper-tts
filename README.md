# Piper TTS - Text-to-Speech Voice Manager

A beautiful web application for managing and using Piper neural text-to-speech voices. This project provides an intuitive interface to browse, install, and test high-quality TTS voices that run entirely in your browser - no cloud subscriptions required!

## ✨ Features

- 🎙️ **Voice Management**: Browse, install, and manage Piper TTS voices
- 🌍 **Language Support**: Filtered to show English and Hindi (India) voices only
- 🔊 **Test Interface**: Test voices with custom text and download audio
- 📊 **Voice Status**: Real-time status tracking (on disk, loading, in memory, in use)
- ⭐ **Popularity Rankings**: See which voices are most popular among users
- 🎨 **Modern UI**: Beautiful, responsive design with smooth animations
- 📱 **Collapsible Sections**: Organized voice lists with expand/collapse functionality
- 💾 **Local Storage**: Voices are stored locally in your browser
- 🚀 **No Cloud Required**: All synthesis happens in-browser using ONNX runtime

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16 or higher recommended)
- **npm** (comes with Node.js)
- A modern web browser (Chrome, Firefox, Edge, Safari)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/ken107/piper-browser-extension.git
   cd piper-browser-extension
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

### Running Locally

1. **Build the project:**
   ```bash
   npm run build-debug
   ```

2. **Serve the build directory:**
   
   **Option A - Using http-server (recommended):**
   ```bash
   npx http-server build/debug -p 8000
   ```
   
   **Option B - Using Python:**
   ```bash
   cd build/debug
   python -m http.server 8000
   ```
   
   **Option C - Using PHP:**
   ```bash
   cd build/debug
   php -S localhost:8000
   ```

3. **Open your browser:**
   Navigate to `http://localhost:8000`

## 📦 Building for Production

To create an optimized production build:

```bash
npm run build-release
```

The production files will be output to `build/release/`.

## 🌐 Deployment

### Deploy to Vercel

The easiest way to deploy this project is using Vercel:

1. **Push your code to GitHub/GitLab/Bitbucket**

2. **Go to [vercel.com](https://vercel.com)** and sign in

3. **Import your repository:**
   - Click "Add New..." → "Project"
   - Import your Git repository
   - Vercel will automatically detect settings from `vercel.json`

4. **Deploy:**
   - Click "Deploy"
   - Your site will be live at `https://your-project.vercel.app`

See [DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md) for detailed deployment instructions.

## 📁 Project Structure

```
funpiper-tts/
├── src/                    # Source code
│   ├── index.tsx          # Main React component
│   ├── audio.ts           # Audio playback handling
│   ├── synthesizer.ts     # Voice synthesis logic
│   ├── services.ts        # Voice list and installation services
│   ├── storage.ts         # Browser storage utilities
│   └── ...
├── dist/                  # Static assets (HTML, CSS, WASM files)
├── build/                 # Build output
│   ├── debug/            # Development build
│   └── release/          # Production build
├── package.json          # Dependencies and scripts
├── webpack.config.js     # Webpack configuration
├── tsconfig.json         # TypeScript configuration
├── vercel.json           # Vercel deployment config
└── README.md             # This file
```

## 🛠️ Technologies Used

- **React 18** - UI framework
- **TypeScript** - Type-safe JavaScript
- **Webpack** - Module bundler
- **ONNX Runtime Web** - Machine learning inference in browser
- **RxJS** - Reactive programming
- **Bootstrap** - UI styling framework
- **Web Workers** - Background processing for voice synthesis

## 📝 Available Scripts

- `npm run build-debug` - Build for development (with source maps)
- `npm run build-release` - Build for production (optimized)
- `npm run deploy-prod` - Build and deploy to AWS S3 (requires AWS credentials)

## 🎯 Key Features Explained

### Voice Filtering
The application automatically filters voices to show only:
- **English voices** (all variants: en_US, en_GB, etc.)
- **Hindi voices from India** (hi_IN)

### Voice Installation
- Voices are downloaded and stored in browser's IndexedDB
- Installation progress is shown in real-time
- Voices can be deleted to free up storage space

### Testing Voices
- Enter any text in the test section
- Select a voice from the dropdown
- Click "Speak" to hear it or "Download" to save as audio file

## 🔧 Configuration

Voice list and settings can be configured in `src/config.ts`:
- Voice repository URL
- Excluded voices
- Default synthesis parameters
- Storage settings

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Piper Project** - High-quality TTS voices ([GitHub](https://github.com/rhasspy/piper))
- **ONNX Runtime** - For browser-based ML inference
- **LSD Software** - Original project maintainers

## 📞 Support

For issues, questions, or contributions:
- Open an issue on [GitHub](https://github.com/ken107/piper-browser-extension/issues)
- Check the original repository: [piper-browser-extension](https://github.com/ken107/piper-browser-extension)

---

**Made with ❤️ for better text-to-speech experiences**
