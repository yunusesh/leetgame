package settings

type Auth struct {
	SupabaseJWTSecret string `env:"SUPABASE_JWT_SECRET,required"`
}
