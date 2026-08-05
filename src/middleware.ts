import { clerkMiddleware } from '@clerk/astro/server';

export const onRequest = clerkMiddleware((auth, context) => {
  const isProtectedRoute = context.request.url.includes('/dashboard');
  
  if (!auth().userId && isProtectedRoute) {
    return auth().redirectToSignIn();
  }
});
