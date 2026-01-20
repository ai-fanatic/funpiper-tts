# How to Deploy to Vercel

Simple steps to publish this Piper TTS project to Vercel.

## Prerequisites

1. A Vercel account (sign up at [vercel.com](https://vercel.com) if you don't have one)
2. Git repository (GitHub, GitLab, or Bitbucket)

## Step 1: Push Your Code to Git

Make sure your project is in a Git repository and pushed to GitHub/GitLab/Bitbucket:

```bash
git add .
git commit -m "Ready for deployment"
git push origin main
```

## Step 2: Install Vercel CLI (Optional - for command line)

```bash
npm install -g vercel
```

*Note: You can also deploy directly from the Vercel website without installing the CLI.*

## Step 3: Deploy via Vercel Website (Recommended)

1. **Go to [vercel.com](https://vercel.com)** and sign in
2. **Click "Add New..." → "Project"**
3. **Import your Git repository** (connect GitHub/GitLab/Bitbucket if needed)
4. **Select your repository** from the list
5. **Configure the project:**
   - **Framework Preset:** Other
   - **Build Command:** `npm run build-release`
   - **Output Directory:** `build/release`
   - **Install Command:** `npm install`
6. **Click "Deploy"**

## Step 4: Deploy via CLI (Alternative)

1. **Login to Vercel:**
   ```bash
   vercel login
   ```

2. **Deploy from project root:**
   ```bash
   vercel
   ```

3. **Follow the prompts:**
   - Link to existing project or create new
   - Confirm settings (build command, output directory)

4. **For production deployment:**
   ```bash
   vercel --prod
   ```

## Configuration

The project includes a `vercel.json` file that automatically configures:
- Build command: `npm run build-release`
- Output directory: `build/release`
- Static file serving

You don't need to change anything - just deploy!

## After Deployment

1. Vercel will provide you with a URL like: `https://your-project.vercel.app`
2. Your site will automatically rebuild and redeploy when you push to your Git repository
3. You can set up a custom domain in the Vercel dashboard if needed

## Troubleshooting

- **Build fails?** Make sure all dependencies are in `package.json`
- **404 errors?** Verify the output directory is set to `build/release`
- **Assets not loading?** Check that all files are being copied to the build directory

## That's it! 🎉

Your Piper TTS app is now live on Vercel!
