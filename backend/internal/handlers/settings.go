package handlers

import (
	"leetgame/internal/constants"
	"leetgame/internal/xcontext"
	"leetgame/internal/xerrors"

	"github.com/gofiber/fiber/v2"
)

func (hs *HandlerService) GetSettings(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	settings, err := hs.storage.GetUserSettings(c.Context(), uid)
	if err != nil {
		return err
	}

	type response struct {
		ActiveStages []string `json:"active_stages"`
		HideTitle    bool     `json:"hide_title"`
	}
	return c.JSON(response{ActiveStages: settings.ActiveStages, HideTitle: settings.HideTitle})
}

func (hs *HandlerService) UpdateSettings(c *fiber.Ctx) error {
	uid, err := xcontext.GetUserID(c)
	if err != nil {
		return xerrors.UnauthorizedError()
	}

	type request struct {
		ActiveStages []string `json:"active_stages"`
		HideTitle    bool     `json:"hide_title"`
	}
	var req request
	if err := c.BodyParser(&req); err != nil {
		return xerrors.InvalidJSON()
	}

	if errs := validateActiveStages(req.ActiveStages); len(errs) > 0 {
		return xerrors.UnprocessableEntityError(errs)
	}

	if err := hs.storage.UpsertUserSettings(c.Context(), uid, req.ActiveStages, req.HideTitle); err != nil {
		return err
	}

	return c.SendStatus(200)
}

func validateActiveStages(stages []string) map[string]string {
	errs := map[string]string{}
	if len(stages) == 0 {
		errs["active_stages"] = "must contain at least one stage"
		return errs
	}
	seen := map[string]bool{}
	prevIdx := -1
	for _, s := range stages {
		if !constants.ValidStageIDs[s] {
			errs["active_stages"] = "invalid stage: " + s
			return errs
		}
		if seen[s] {
			errs["active_stages"] = "duplicate stage: " + s
			return errs
		}
		seen[s] = true
		idx := constants.CanonicalStageIndex(s)
		if idx <= prevIdx {
			errs["active_stages"] = "stages must be in canonical order: edge_cases, brute_force, pattern, algorithm, tc_sc"
			return errs
		}
		prevIdx = idx
	}
	return errs
}
