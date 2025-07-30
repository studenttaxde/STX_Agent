# 🚀 Deployment Guide

This guide will help you deploy the German Tax Advisor application to Render (backend) and Netlify (frontend).

## 📋 Prerequisites

- GitHub account with the project repository
- Render account (free tier available)
- Netlify account (free tier available)
- OpenAI API key
- LangSmith API key

## 🔧 Backend Deployment (Render)

### 1. Connect to Render

1. Go to [render.com](https://render.com) and sign up/login
2. Click "New +" and select "Web Service"
3. Connect your GitHub repository
4. Select the repository: `studenttaxde/STX_Advisor`

### 2. Configure the Service

**Basic Settings:**
- **Name**: `pdf-extractor-service`
- **Environment**: `Python 3`
- **Region**: Choose closest to your users
- **Branch**: `main`
- **Root Directory**: `pdf-extractor-service`

**Build & Deploy Settings:**
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### 3. Environment Variables

Add these environment variables in Render:

```
LANGCHAIN_API_KEY=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
LANGCHAIN_PROJECT=STX_Advisor
LANGCHAIN_ENDPOINT=https://api.smith.langchain.com
LANGCHAIN_TRACING_V2=true
OPENAI_API_KEY=your_openai_api_key_here
```

### 4. Deploy

Click "Create Web Service" and wait for deployment to complete.

**Note**: Save the service URL (e.g., `https://pdf-extractor-service.onrender.com`)

## 🌐 Frontend Deployment (Netlify)

### 1. Connect to Netlify

1. Go to [netlify.com](https://netlify.com) and sign up/login
2. Click "Add new site" → "Import an existing project"
3. Connect your GitHub repository
4. Select the repository: `studenttaxde/STX_Advisor`

### 2. Configure Build Settings

**Build Settings:**
- **Base directory**: `stx-advisor-nextjs`
- **Build command**: `npm run build`
- **Publish directory**: `.next`

### 3. Environment Variables

Add these environment variables in Netlify:

```
BACKEND_URL=https://your-render-service-url.onrender.com
NODE_ENV=production
```

### 4. Deploy

Click "Deploy site" and wait for deployment to complete.

## 🔗 Connect Frontend to Backend

### Update Backend URL

1. In Netlify, go to your site settings
2. Add environment variable:
   - **Key**: `BACKEND_URL`
   - **Value**: Your Render service URL (e.g., `https://pdf-extractor-service.onrender.com`)

### Redeploy Frontend

1. In Netlify, go to "Deploys"
2. Click "Trigger deploy" → "Deploy site"

## ✅ Testing Deployment

### Test Backend (Render)

```bash
curl https://your-render-service.onrender.com/health
```

Expected response: `{"status": "healthy", "service": "PDF Extractor Service"}`

### Test Frontend (Netlify)

1. Visit your Netlify site URL
2. Upload a test PDF
3. Verify the chat interface works

## 🔧 Troubleshooting

### Common Issues

**Backend Issues:**
- **Port binding**: Ensure using `$PORT` environment variable
- **Dependencies**: Check `requirements.txt` is complete
- **Memory**: Render free tier has 512MB RAM limit

**Frontend Issues:**
- **Build errors**: Check Node.js version (use 18+)
- **API calls**: Verify `BACKEND_URL` is correct
- **CORS**: Backend should allow requests from Netlify domain

### Debug Commands

**Check Render logs:**
```bash
# In Render dashboard → Logs
```

**Check Netlify logs:**
```bash
# In Netlify dashboard → Deploys → View deploy log
```

## 📊 Monitoring

### Render Monitoring
- **Logs**: Available in Render dashboard
- **Metrics**: CPU, memory usage
- **Health checks**: Automatic monitoring

### Netlify Monitoring
- **Analytics**: Built-in analytics
- **Forms**: Form submissions
- **Functions**: Serverless function logs

## 🔄 Continuous Deployment

Both platforms support automatic deployments:

1. **Render**: Automatically deploys on `main` branch pushes
2. **Netlify**: Automatically deploys on `main` branch pushes

## 🚀 Production Checklist

- [ ] Backend deployed and responding
- [ ] Frontend deployed and accessible
- [ ] Environment variables configured
- [ ] CORS properly configured
- [ ] Health checks passing
- [ ] Test file upload working
- [ ] Chat interface functional
- [ ] Error handling in place

## 📞 Support

If you encounter issues:

1. Check the logs in both platforms
2. Verify environment variables
3. Test locally first
4. Check network connectivity between services

## 🔐 Security Notes

- Keep API keys secure
- Use environment variables for sensitive data
- Enable HTTPS (automatic on both platforms)
- Monitor for unusual activity 