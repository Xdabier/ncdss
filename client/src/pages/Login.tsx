import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Alert, AlertDescription } from '../components/ui/alert';
import { getServerUrl, setServerUrl } from '../services/config';
import { getApi, setAuthToken, clearApi } from '../services/api';
import { useAuthStore } from '../stores/auth.store';

export default function Login() {
  const navigate = useNavigate();
  const { setAuth, isAuthenticated } = useAuthStore();

  const [serverAddress, setServerAddress] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showServerInput, setShowServerInput] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    checkServerConfig();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  const checkServerConfig = async () => {
    const url = await getServerUrl();
    if (url) {
      setServerAddress(url);
      setShowServerInput(false);
    }
  };

  const handleServerConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      // Test connection
      const response = await fetch(`http://${serverAddress}/api/health`);
      if (!response.ok) throw new Error('Serveur non disponible');

      await setServerUrl(serverAddress);
      setShowServerInput(false);
    } catch (e) {
      setError("Impossible de se connecter au serveur. Vérifiez l'adresse.");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError(null);

    try {
      const api = await getApi();
      const response = await api.post('/auth/login', { username, password });

      const { accessToken, refreshToken, user, todayAssignment } = response.data;
      setAuthToken(accessToken);
      await setAuth(user, accessToken, refreshToken, todayAssignment);

      navigate('/dashboard');
    } catch (e: any) {
      setError(e.response?.data?.error || 'Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const handleChangeServer = () => {
    clearApi();
    setShowServerInput(true);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-gray-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-3xl">🏥 NCDSS</CardTitle>
          <CardDescription>Système d'Aide à la Décision Clinique</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {showServerInput ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="server">Adresse du serveur</Label>
                <Input
                  id="server"
                  type="text"
                  placeholder="192.168.1.100:3000"
                  value={serverAddress}
                  onChange={(e) => setServerAddress(e.target.value)}
                  disabled={loading}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleServerConnect}
                disabled={!serverAddress || loading}
              >
                {loading ? 'Connexion...' : 'Connecter au serveur'}
              </Button>
            </>
          ) : (
            <>
              <div className="text-center text-sm text-muted-foreground mb-4">
                Serveur: <code className="bg-gray-100 px-2 py-1 rounded">{serverAddress}</code>
                <Button variant="link" size="sm" onClick={handleChangeServer} className="ml-2">
                  Changer
                </Button>
              </div>

              <div className="space-y-2">
                <Label htmlFor="username">Nom d'utilisateur</Label>
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loading}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mot de passe</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                />
              </div>

              <Button
                className="w-full"
                onClick={handleLogin}
                disabled={!username || !password || loading}
              >
                {loading ? 'Connexion...' : 'Se connecter'}
              </Button>
            </>
          )}

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
