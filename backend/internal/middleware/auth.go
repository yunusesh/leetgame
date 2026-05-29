package middleware

import (
	"strings"

	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

func RequireAuth(jwtSecret string) fiber.Handler {
	return func(c *fiber.Ctx) error {
		authHeader := c.Get("Authorization")
		if !strings.HasPrefix(authHeader, "Bearer ") {
			return xerrors.UnauthorizedError()
		}
		tokenStr := authHeader[7:]

		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (any, error) {
			if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, xerrors.UnauthorizedError()
			}
			return []byte(jwtSecret), nil
		})
		if err != nil || !token.Valid {
			return xerrors.UnauthorizedError()
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			return xerrors.UnauthorizedError()
		}
		sub, ok := claims["sub"].(string)
		if !ok {
			return xerrors.UnauthorizedError()
		}
		uid, err := uuid.Parse(sub)
		if err != nil {
			return xerrors.UnauthorizedError()
		}

		xcontext.SetUserID(c, uid)
		return c.Next()
	}
}
