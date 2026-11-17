import api from './api';
import { AuthUser } from '../types';

export const authService = {
  async login(email: string, password: string): Promise<AuthUser> {
    const response = await api.post('/auth/login', { email, password });
    const user: AuthUser = {
      id: response.data.user.id,
      name: response.data.user.name,
      email: response.data.user.email,
      access_token: response.data.access_token,
    };
    localStorage.setItem('mayic_token', user.access_token);
    localStorage.setItem('mayic_user', JSON.stringify(user));
    return user;
  },

  getCurrentUser(): AuthUser | null {
    const userStr = localStorage.getItem('mayic_user');
    if (!userStr) return null;
    try {
      return JSON.parse(userStr);
    } catch {
      return null;
    }
  },

  logout(): void {
    localStorage.removeItem('mayic_token');
    localStorage.removeItem('mayic_user');
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('mayic_token');
  }
};
