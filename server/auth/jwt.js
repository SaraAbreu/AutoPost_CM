import jwt from 'jsonwebtoken';

export function signToken(user) {
  return jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

// Devuelve el payload decodificado, o null si el token falta/es inválido/expiró
// — el caller decide qué hacer (authMiddleware simplemente no autentica).
export function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return null;
  }
}
