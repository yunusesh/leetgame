package handlers

import (
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) RecordStreak(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	if err := hs.storage.UpsertPracticeDay(c.Context(), uid); err != nil {
		return err
	}

	streak, err := hs.storage.GetStreak(c.Context(), uid)
	if err != nil {
		return err
	}

	type response struct {
		Streak int `json:"streak"`
	}
	return c.JSON(response{Streak: streak})
}

func (hs *HandlerService) GetStreak(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	streak, err := hs.storage.GetStreak(c.Context(), uid)
	if err != nil {
		return err
	}

	type response struct {
		Streak int `json:"streak"`
	}
	return c.JSON(response{Streak: streak})
}
