from __future__ import annotations

from collections import Counter, defaultdict
import asyncio
from datetime import date, datetime
from decimal import Decimal
import os
import secrets
import unicodedata
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from validation import (
    clean_text,
    normalize_cid10,
    normalize_cnpj,
    normalize_cns,
    normalize_code,
    normalize_cpf,
    normalize_phone,
    normalize_sigtap,
    validate_birth_date,
    validate_date_range,
)

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
def parse_cors_origins(raw_value: str) -> list[str]:
    origins: list[str] = []
    for item in raw_value.split(","):
        origin = item.strip().strip('"').strip("'")
        if origin and origin != "*":
            origin = origin.rstrip("/")
        if origin:
            origins.append(origin)
    return origins or ["*"]


CORS_ORIGINS = parse_cors_origins(os.getenv("CORS_ORIGINS", "*"))

if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
    raise RuntimeError("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no arquivo .env do backend.")

app = FastAPI(title="UMDR API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=CORS_ORIGINS != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer(auto_error=False)


FIELD_LABELS = {
    "email": "E-mail",
    "password": "Senha",
    "nome_completo": "Nome completo",
    "nome": "Nome",
    "cns": "CNS",
    "cpf": "CPF",
    "cnpj": "CNPJ",
    "data_nascimento": "Data de nascimento",
    "sexo": "Sexo",
    "municipio_residencia_ibge6": "Município",
    "telefone_contato": "Telefone",
    "telefone": "Telefone",
    "cbo": "CBO",
    "cnes_vinculo": "Unidade CNES",
    "papel": "Perfil de acesso",
    "numero_conselho": "Número do conselho",
    "tipo_conselho": "Tipo do conselho",
    "endereco": "Endereço",
    "numero_contrato": "Número do contrato",
    "valor_total": "Valor do contrato",
    "data_inicio": "Data de início",
    "data_fim": "Data de término",
    "sla_percentual": "SLA",
    "paciente_id": "Paciente",
    "procedimento_sigtap": "Procedimento SIGTAP",
    "cid10_codigo": "CID-10",
    "prioridade_clinica": "Prioridade",
    "lado_acometido": "Lado acometido",
    "justificativa_clinica": "Justificativa clínica",
    "distancia_estimada_cre_km": "Distância estimada até o CRE",
    "estabelecimento_solicitante_cnes": "UBS solicitante",
    "profissional_solicitante_id": "Profissional solicitante",
    "codigo_cnes": "CNES do CRE",
    "razao_social": "Razão social",
    "nome_fantasia": "Nome do CRE",
    "tipo_estabelecimento": "Tipo de estabelecimento",
    "municipio_ibge6": "Município",
    "logradouro": "Endereço",
    "capacidade_producao_mensal": "Capacidade mensal",
    "nome_responsavel": "Responsável técnico",
    "email_responsavel": "E-mail do responsável",
    "password_responsavel": "Senha do responsável",
    "cns_responsavel": "CNS do responsável",
    "cpf_responsavel": "CPF do responsável",
    "cbo_responsavel": "CBO do responsável",
    "solicitacao_id": "Solicitação",
    "cre_destino_cnes": "CRE de destino",
    "numero_autorizacao": "Número de autorização SISREG",
    "produto_id": "Produto OPM",
    "oficina_id": "CRE parceiro",
    "nome_ong": "Nome da ONG",
    "tipo_parceria": "Tipo de parceria",
    "responsavel_contato": "Responsável de contato",
    "observacoes": "Observações",
}


def _friendly_validation_message(error: dict[str, Any]) -> tuple[str, str]:
    loc = error.get("loc") or []
    field = str(loc[-1]) if loc else "dados"
    label = FIELD_LABELS.get(field, field.replace("_", " ").capitalize())
    error_type = str(error.get("type") or "")
    message = str(error.get("msg") or "Valor inválido.")
    if message.startswith("Value error, "):
        message = message.removeprefix("Value error, ")
    if error_type == "missing":
        message = f'O campo "{label}" é obrigatório.'
    elif error_type == "string_too_short":
        minimum = (error.get("ctx") or {}).get("min_length")
        message = f'O campo "{label}" deve ter pelo menos {minimum} caracteres.' if minimum else f'O campo "{label}" está muito curto.'
    elif error_type in {"value_error", "string_pattern_mismatch"}:
        if label.lower() not in message.lower():
            message = f"{label}: {message}"
    elif error_type.startswith("literal_error"):
        message = f'O valor informado em "{label}" não é permitido.'
    elif error_type in {"date_from_datetime_parsing", "date_type"}:
        message = f'A data informada em "{label}" é inválida.'
    elif error_type in {"float_parsing", "int_parsing", "float_type", "int_type"}:
        message = f'O campo "{label}" deve conter um número válido.'
    elif error_type == "value_error" and label.lower() not in message.lower():
        message = f"{label}: {message}"
    return field, message


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    # Pydantic/FastAPI versions differ: older ValidationException.errors() does not
    # accept include_url. Keep the handler compatible so validation never becomes 500.
    try:
        errors = exc.errors(include_url=False)
    except TypeError:
        errors = exc.errors()

    field_errors = []
    for error in errors:
        field, message = _friendly_validation_message(error)
        field_errors.append({"field": field, "message": message})
    detail = " ".join(item["message"] for item in field_errors) or "Revise os dados informados."
    return JSONResponse(status_code=422, content={"detail": detail, "field_errors": field_errors})


# -----------------------------------------------------------------------------
# Utilitários pequenos: o backend apenas autentica, consulta e repassa dados.
# -----------------------------------------------------------------------------

async def _request(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
    json: Any = None,
) -> httpx.Response:
    async with httpx.AsyncClient(timeout=30.0) as client:
        response = await client.request(method, url, headers=headers, params=params, json=json)
    return response


def _db_headers(schema: str, write: bool = False, return_representation: bool = False) -> dict[str, str]:
    headers = {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        "Accept": "application/json",
        "Accept-Profile": schema,
    }
    if write:
        headers["Content-Type"] = "application/json"
        headers["Content-Profile"] = schema
    if return_representation:
        headers["Prefer"] = "return=representation"
    return headers


async def db_request(
    method: str,
    schema: str,
    resource: str,
    *,
    params: dict[str, Any] | None = None,
    body: Any = None,
    return_representation: bool = False,
) -> Any:
    response = await _request(
        method,
        f"{SUPABASE_URL}/rest/v1/{resource}",
        headers=_db_headers(schema, method != "GET", return_representation),
        params=params,
        json=body,
    )
    if response.status_code >= 400:
        detail = response.text
        database_code = None
        try:
            payload = response.json()
            database_code = payload.get("code")
            detail = payload.get("message") or payload.get("details") or payload.get("hint") or detail
        except ValueError:
            pass
        if database_code == "23505":
            raise HTTPException(status_code=409, detail="Já existe um registro com um dos identificadores informados.")
        if database_code in {"23502", "23503", "23514", "22P02"} or 400 <= response.status_code < 500:
            raise HTTPException(status_code=422, detail=f"Os dados não puderam ser gravados: {detail}")
        raise HTTPException(status_code=502, detail="O banco de dados não respondeu corretamente.")
    if response.status_code == 204 or not response.content:
        return None
    return response.json()


async def db_select(
    schema: str,
    resource: str,
    *,
    select: str = "*",
    filters: dict[str, Any] | None = None,
    order: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"select": select}
    if filters:
        params.update(filters)
    if order:
        params["order"] = order
    if limit is not None:
        params["limit"] = str(limit)
    result = await db_request("GET", schema, resource, params=params)
    return result or []


async def db_insert(schema: str, resource: str, body: dict[str, Any] | list[dict[str, Any]]) -> list[dict[str, Any]]:
    result = await db_request("POST", schema, resource, body=body, return_representation=True)
    return result or []


async def db_update(
    schema: str,
    resource: str,
    filters: dict[str, Any],
    body: dict[str, Any],
) -> list[dict[str, Any]]:
    result = await db_request(
        "PATCH",
        schema,
        resource,
        params=filters,
        body=body,
        return_representation=True,
    )
    return result or []


async def db_delete(schema: str, resource: str, filters: dict[str, Any]) -> None:
    await db_request("DELETE", schema, resource, params=filters)


async def db_rpc(schema: str, function_name: str, body: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    result = await db_request(
        "POST",
        schema,
        f"rpc/{function_name}",
        body=body or {},
        return_representation=True,
    )
    return result or []


async def ensure_record_exists(
    schema: str,
    resource: str,
    field: str,
    value: Any,
    message: str,
    *,
    extra_filters: dict[str, Any] | None = None,
) -> None:
    filters = {field: f"eq.{value}"}
    if extra_filters:
        filters.update(extra_filters)
    rows = await db_select(schema, resource, select=field, filters=filters, limit=1)
    if not rows:
        raise HTTPException(status_code=422, detail=message)


async def ensure_unique(
    schema: str,
    resource: str,
    field: str,
    value: Any,
    message: str,
) -> None:
    if value is None:
        return
    rows = await db_select(schema, resource, select=field, filters={field: f"eq.{value}"}, limit=1)
    if rows:
        raise HTTPException(status_code=409, detail=message)


async def create_auth_user(
    email: str,
    password: str,
    display_name: str,
    *,
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    user_metadata = {"display_name": display_name}
    if metadata:
        user_metadata.update(metadata)
    response = await _request(
        "POST",
        f"{SUPABASE_URL}/auth/v1/admin/users",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": user_metadata,
        },
    )
    if response.status_code >= 400:
        detail = response.text
        try:
            detail = response.json().get("msg") or response.json().get("message") or detail
        except ValueError:
            pass
        raise HTTPException(status_code=422, detail=f"Não foi possível criar o login: {detail}")
    return response.json()


def temporary_patient_email(cpf: str) -> str:
    # Endereço técnico interno usado somente até o paciente concluir o primeiro acesso.
    return f"patient.{cpf}@first-access.example.com"


def generate_temporary_patient_password() -> str:
    # Credencial técnica, aleatória e invisível ao paciente. Ela existe apenas
    # para o Supabase emitir uma sessão durante o onboarding.
    return f"{secrets.token_urlsafe(24)}A1!"


def normalize_identity_name(value: Any) -> str:
    text = " ".join(str(value or "").strip().split())
    normalized = unicodedata.normalize("NFKD", text)
    without_accents = "".join(char for char in normalized if not unicodedata.combining(char))
    return without_accents.casefold()


async def sign_in_auth_user(email: str, password: str) -> dict[str, Any]:
    response = await _request(
        "POST",
        f"{SUPABASE_URL}/auth/v1/token?grant_type=password",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Content-Type": "application/json",
        },
        json={"email": email, "password": password},
    )
    if response.status_code >= 400:
        raise HTTPException(status_code=401, detail="Não foi possível iniciar a sessão de primeiro acesso.")
    return response.json()


async def delete_auth_user(user_id: str) -> None:
    await _request(
        "DELETE",
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
        },
    )


async def update_auth_user(user_id: str, body: dict[str, Any]) -> dict[str, Any]:
    response = await _request(
        "PUT",
        f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
            "Content-Type": "application/json",
        },
        json=body,
    )
    if response.status_code >= 400:
        detail = response.text
        try:
            payload = response.json()
            detail = payload.get("msg") or payload.get("message") or detail
        except ValueError:
            pass
        raise HTTPException(status_code=422, detail=f"Não foi possível atualizar a credencial: {detail}")
    return response.json()


class FirstAccessLogin(BaseModel):
    cpf: str
    nome_completo: str = Field(min_length=3, max_length=200)
    data_nascimento: date

    @field_validator("cpf", mode="before")
    @classmethod
    def validate_cpf(cls, value: Any) -> str:
        result = normalize_cpf(value)
        if result is None:
            raise ValueError("CPF inválido.")
        return result

    @field_validator("nome_completo", mode="before")
    @classmethod
    def validate_name(cls, value: Any) -> str:
        result = clean_text(value, field="Nome completo", required=True, max_length=200)
        assert result is not None
        return result

    @field_validator("data_nascimento", mode="before")
    @classmethod
    def validate_first_access_birth_date(cls, value: Any) -> date:
        if isinstance(value, date):
            return value
        text = str(value or "").strip()
        for fmt in ("%d/%m/%Y", "%Y-%m-%d"):
            try:
                parsed = datetime.strptime(text, fmt).date()
                if parsed > date.today():
                    raise ValueError("Data de nascimento inválida.")
                return parsed
            except ValueError:
                continue
        raise ValueError("Data de nascimento inválida. Use DD/MM/AAAA.")


@app.post("/api/auth/first-access")
async def first_access_login(payload: FirstAccessLogin) -> dict[str, Any]:
    patients = await db_select(
        "fila",
        "paciente",
        select="id,cpf,nome_completo,data_nascimento",
        filters={"cpf": f"eq.{payload.cpf}"},
        limit=1,
    )
    if not patients:
        raise HTTPException(status_code=401, detail="Não foi possível confirmar os dados. Confira CPF, nome completo e data de nascimento.")

    patient = patients[0]
    try:
        birth_date = date.fromisoformat(str(patient["data_nascimento"])[:10])
    except (TypeError, ValueError, KeyError):
        raise HTTPException(status_code=409, detail="O cadastro deste paciente não possui uma data de nascimento válida.")

    if birth_date != payload.data_nascimento or normalize_identity_name(patient.get("nome_completo")) != normalize_identity_name(payload.nome_completo):
        raise HTTPException(status_code=401, detail="Não foi possível confirmar os dados. Confira CPF, nome completo e data de nascimento.")

    profiles = await db_select(
        "app",
        "usuario_sistema",
        select="auth_user_id,primeiro_acesso_concluido,ativo",
        filters={"paciente_id": f"eq.{patient['id']}", "papel": "eq.PACIENTE", "ativo": "eq.true"},
        limit=1,
    )
    if not profiles:
        raise HTTPException(status_code=409, detail="O paciente existe, mas ainda não possui uma credencial de acesso vinculada.")
    if profiles[0].get("primeiro_acesso_concluido") is True:
        raise HTTPException(status_code=409, detail="Seu primeiro acesso já foi concluído. Entre com o e-mail e a senha que você cadastrou.")

    # A senha técnica é regenerada somente após a identidade ser validada e nunca
    # é exposta ao usuário. Assim, data de nascimento deixa de funcionar como senha.
    temporary_password = generate_temporary_patient_password()
    await update_auth_user(profiles[0]["auth_user_id"], {"password": temporary_password})
    session = await sign_in_auth_user(temporary_patient_email(payload.cpf), temporary_password)
    return {
        "access_token": session.get("access_token"),
        "refresh_token": session.get("refresh_token"),
        "expires_in": session.get("expires_in"),
        "token_type": session.get("token_type", "bearer"),
    }


class Identity(BaseModel):
    auth_user_id: str
    email: str | None = None
    id: int
    papel: Literal["PACIENTE", "FISCAL_CRE", "GESTOR"]
    paciente_id: int | None = None
    profissional_saude_id: int | None = None
    cnes_vinculo: str | None = None
    nome_exibicao: str
    idioma_preferido: str = "pt-BR"
    primeiro_acesso_concluido: bool = True
    primeiro_acesso_em: datetime | None = None


async def current_identity(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> Identity:
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sessão não autenticada.")

    response = await _request(
        "GET",
        f"{SUPABASE_URL}/auth/v1/user",
        headers={
            "apikey": SUPABASE_SERVICE_KEY,
            "Authorization": f"Bearer {credentials.credentials}",
        },
    )
    if response.status_code >= 400:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido ou expirado.")

    auth_user = response.json()
    rows = await db_select(
        "app",
        "usuario_sistema",
        filters={"auth_user_id": f"eq.{auth_user['id']}", "ativo": "eq.true"},
        limit=1,
    )
    if not rows:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="O login existe, mas ainda não possui um perfil vinculado no sistema.",
        )
    row = dict(rows[0])
    row["auth_user_id"] = auth_user["id"]
    row["email"] = auth_user.get("email")
    return Identity(**row)


def require_roles(identity: Identity, *roles: str) -> None:
    if identity.papel not in roles:
        raise HTTPException(status_code=403, detail="Este perfil não possui permissão para esta operação.")


def number(value: Any) -> float:
    if value is None or value == "":
        return 0
    if isinstance(value, (int, float)):
        return value
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0


def date_key(value: Any) -> str:
    if not value:
        return ""
    return str(value)[:7]


# -----------------------------------------------------------------------------
# Saúde, sessão e perfil
# -----------------------------------------------------------------------------

@app.get("/")
async def root() -> dict[str, str]:
    return {"name": "UMDR API", "status": "online"}


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/me")
async def get_me(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    result = identity.model_dump(exclude={"email"})
    result["unidade_nome"] = None
    if identity.cnes_vinculo:
        units = await db_select(
            "dominio",
            "estabelecimento_cnes",
            select="nome_fantasia,razao_social",
            filters={"codigo_cnes": f"eq.{identity.cnes_vinculo}"},
            limit=1,
        )
        if units:
            result["unidade_nome"] = units[0].get("nome_fantasia") or units[0].get("razao_social")
    return result


class FirstAccessComplete(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


@app.post("/api/auth/first-access/complete")
async def complete_first_access(payload: FirstAccessComplete, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "PACIENTE")
    if identity.primeiro_acesso_concluido:
        raise HTTPException(status_code=409, detail="O primeiro acesso deste paciente já foi concluído.")
    if not identity.paciente_id:
        raise HTTPException(status_code=409, detail="Perfil de paciente sem vínculo cadastral.")

    final_email = str(payload.email).strip().lower()
    await update_auth_user(
        identity.auth_user_id,
        {
            "email": final_email,
            "password": payload.password,
            "email_confirm": True,
            "user_metadata": {"display_name": identity.nome_exibicao, "first_access": False},
        },
    )
    await db_update(
        "fila",
        "paciente",
        {"id": f"eq.{identity.paciente_id}"},
        {"email_contato": final_email},
    )
    await db_update(
        "app",
        "usuario_sistema",
        {"auth_user_id": f"eq.{identity.auth_user_id}"},
        {"primeiro_acesso_concluido": True, "primeiro_acesso_em": datetime.now().isoformat()},
    )
    return {"ok": True, "email": final_email}


class ProfileSettingsPatch(BaseModel):
    nome_exibicao: str | None = None
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8, max_length=128)
    idioma_preferido: Literal["pt-BR", "en-US", "es-419"] | None = None

    @field_validator("nome_exibicao", mode="before")
    @classmethod
    def validate_display_name(cls, value: Any) -> str | None:
        return clean_text(value, field="Nome", required=False, max_length=255)

    @model_validator(mode="after")
    def validate_changes(self) -> "ProfileSettingsPatch":
        if not any(value is not None for value in (self.nome_exibicao, self.email, self.password, self.idioma_preferido)):
            raise ValueError("Informe ao menos uma alteração.")
        return self


@app.get("/api/settings/profile")
async def settings_profile(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    result = identity.model_dump()
    result["unidade_nome"] = None
    if identity.cnes_vinculo:
        units = await db_select(
            "dominio",
            "estabelecimento_cnes",
            select="nome_fantasia,razao_social",
            filters={"codigo_cnes": f"eq.{identity.cnes_vinculo}"},
            limit=1,
        )
        if units:
            result["unidade_nome"] = units[0].get("nome_fantasia") or units[0].get("razao_social")
    return result


@app.patch("/api/settings/profile")
async def update_settings_profile(payload: ProfileSettingsPatch, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    app_changes: dict[str, Any] = {}
    auth_changes: dict[str, Any] = {}

    if payload.nome_exibicao is not None:
        app_changes["nome_exibicao"] = payload.nome_exibicao
        auth_changes.setdefault("user_metadata", {})["display_name"] = payload.nome_exibicao
        if identity.paciente_id:
            await db_update("fila", "paciente", {"id": f"eq.{identity.paciente_id}"}, {"nome_completo": payload.nome_exibicao})
        elif identity.profissional_saude_id:
            await db_update("fila", "profissional_saude", {"id": f"eq.{identity.profissional_saude_id}"}, {"nome_completo": payload.nome_exibicao})

    if payload.idioma_preferido is not None:
        app_changes["idioma_preferido"] = payload.idioma_preferido

    if payload.email is not None and str(payload.email).lower() != str(identity.email or "").lower():
        auth_changes["email"] = str(payload.email)
        auth_changes["email_confirm"] = True
        if identity.paciente_id:
            await db_update("fila", "paciente", {"id": f"eq.{identity.paciente_id}"}, {"email_contato": str(payload.email)})

    if payload.password:
        auth_changes["password"] = payload.password

    if auth_changes:
        await update_auth_user(identity.auth_user_id, auth_changes)
    if app_changes:
        await db_update("app", "usuario_sistema", {"auth_user_id": f"eq.{identity.auth_user_id}"}, app_changes)

    return {"ok": True, "message": "Configurações atualizadas com sucesso."}


# -----------------------------------------------------------------------------
# Página do paciente
# -----------------------------------------------------------------------------

@app.get("/api/patient/profile")
async def patient_profile(identity: Identity = Depends(current_identity)) -> dict[str, Any] | None:
    require_roles(identity, "PACIENTE")
    if not identity.paciente_id:
        return None
    rows = await db_select(
        "fila",
        "vw_paciente_perfil",
        filters={"paciente_id": f"eq.{identity.paciente_id}"},
        limit=1,
    )
    return rows[0] if rows else None


@app.get("/api/patient/orders")
async def patient_orders(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    require_roles(identity, "PACIENTE")
    if not identity.paciente_id:
        return []
    return await db_select(
        "fila",
        "vw_pedido_atual",
        filters={"paciente_id": f"eq.{identity.paciente_id}"},
        order="data_solicitacao.desc",
    )

@app.get("/api/patient/orders/{request_id}/history")
async def patient_order_history(request_id: int, identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    require_roles(identity, "PACIENTE")
    if not identity.paciente_id:
        return []
    allowed = await db_select(
        "fila",
        "solicitacao_ortese",
        select="id",
        filters={"id": f"eq.{request_id}", "paciente_id": f"eq.{identity.paciente_id}"},
        limit=1,
    )
    if not allowed:
        raise HTTPException(status_code=404, detail="Solicitação não encontrada.")
    return await db_select(
        "fila",
        "historico_status_solicitacao",
        filters={"solicitacao_id": f"eq.{request_id}"},
        order="data_alteracao.asc",
    )


@app.get("/api/notifications")
async def notifications(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    return await db_select(
        "app",
        "notificacao",
        filters={"auth_user_id": f"eq.{identity.auth_user_id}"},
        order="criado_em.desc",
        limit=20,
    )


class NotificationPatch(BaseModel):
    lida: bool


@app.patch("/api/notifications/{notification_id}")
async def patch_notification(
    notification_id: int,
    payload: NotificationPatch,
    identity: Identity = Depends(current_identity),
) -> dict[str, Any]:
    rows = await db_update(
        "app",
        "notificacao",
        {"id": f"eq.{notification_id}", "auth_user_id": f"eq.{identity.auth_user_id}"},
        {"lida": payload.lida},
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Notificação não encontrada.")
    return rows[0]


# -----------------------------------------------------------------------------
# Identidade física do dispositivo e suporte paciente-CRE
# -----------------------------------------------------------------------------

async def _patient_device_rows(patient_id: int) -> list[dict[str, Any]]:
    rows = await db_select(
        "producao",
        "dispositivo_opm",
        filters={"paciente_id": f"eq.{patient_id}"},
        order="data_ativacao.desc,criado_em.desc",
        limit=50,
    )
    return [row for row in rows if row.get("status") not in {"SUBSTITUIDO", "RECOLHIDO", "DESCARTADO"}]


async def _hydrate_device(device: dict[str, Any]) -> dict[str, Any]:
    order_rows = await db_select(
        "producao",
        "ordem_producao",
        select="id,solicitacao_id,produto_id,oficina_id,status,data_conclusao",
        filters={"id": f"eq.{device['ordem_producao_id']}"},
        limit=1,
    )
    order = order_rows[0] if order_rows else {}
    product_rows = await db_select(
        "producao",
        "produto_ortese",
        select="id,nome_produto,especificacao_tecnica",
        filters={"id": f"eq.{device.get('produto_id') or order.get('produto_id')}"},
        limit=1,
    ) if (device.get("produto_id") or order.get("produto_id")) else []
    product = product_rows[0] if product_rows else {}
    workshop_rows = await db_select(
        "producao",
        "oficina_ortopedica",
        select="id,cnes,nome",
        filters={"id": f"eq.{device.get('oficina_id') or order.get('oficina_id')}"},
        limit=1,
    ) if (device.get("oficina_id") or order.get("oficina_id")) else []
    workshop = workshop_rows[0] if workshop_rows else {}
    unit_rows = await db_select(
        "dominio",
        "estabelecimento_cnes",
        select="codigo_cnes,nome_fantasia,razao_social,telefone,logradouro,municipio_ibge6",
        filters={"codigo_cnes": f"eq.{workshop.get('cnes')}"},
        limit=1,
    ) if workshop.get("cnes") else []
    unit = unit_rows[0] if unit_rows else {}
    delivery_rows = await db_select(
        "producao",
        "entrega_ortese",
        select="data_entrega",
        filters={"ordem_producao_id": f"eq.{device['ordem_producao_id']}"},
        limit=1,
    )
    usage_rows = await db_select(
        "producao",
        "uso_dispositivo",
        filters={"dispositivo_id": f"eq.{device['id']}"},
        order="inicio_uso.desc",
        limit=5000,
    )
    total_minutes = 0
    for usage in usage_rows:
        try:
            start = datetime.fromisoformat(str(usage["inicio_uso"]).replace("Z", "+00:00"))
            end = datetime.fromisoformat(str(usage["fim_uso"]).replace("Z", "+00:00"))
            total_minutes += max(0, int((end - start).total_seconds() // 60))
        except (KeyError, TypeError, ValueError):
            continue
    return {
        **device,
        "solicitacao_id": order.get("solicitacao_id"),
        "nome_produto": product.get("nome_produto"),
        "especificacao_tecnica": product.get("especificacao_tecnica"),
        "oficina_nome": workshop.get("nome"),
        "cnes_cre": workshop.get("cnes"),
        "cre_nome": unit.get("nome_fantasia") or unit.get("razao_social"),
        "cre_telefone": unit.get("telefone"),
        "cre_endereco": unit.get("logradouro"),
        "data_entrega": delivery_rows[0].get("data_entrega") if delivery_rows else None,
        "numero_usos": len(usage_rows),
        "tempo_total_uso_minutos": total_minutes,
        "ultimo_uso_em": usage_rows[0].get("inicio_uso") if usage_rows else None,
    }


async def _patient_related_cre(identity: Identity) -> dict[str, Any]:
    if not identity.paciente_id:
        raise HTTPException(status_code=422, detail="O paciente não possui vínculo cadastrado.")
    devices = await _patient_device_rows(identity.paciente_id)
    device = await _hydrate_device(devices[0]) if devices else None
    cnes = device.get("cnes_cre") if device else None
    request_id = device.get("solicitacao_id") if device else None
    if not cnes:
        requests = await db_select(
            "fila",
            "solicitacao_ortese",
            select="id,cre_destino_cnes,status,data_solicitacao",
            filters={"paciente_id": f"eq.{identity.paciente_id}"},
            order="data_solicitacao.desc",
            limit=20,
        )
        current = next((row for row in requests if row.get("status") not in {"CANCELADA", "NEGADA"}), requests[0] if requests else None)
        if current:
            cnes = current.get("cre_destino_cnes")
            request_id = current.get("id")
    if not cnes:
        raise HTTPException(
            status_code=409,
            detail="O SISREG ainda não vinculou esta solicitação a um CRE. O suporte do CRE ficará disponível após a autorização e o encaminhamento.",
        )
    units = await db_select(
        "dominio",
        "estabelecimento_cnes",
        select="codigo_cnes,nome_fantasia,razao_social,telefone,logradouro,tipo_estabelecimento",
        filters={"codigo_cnes": f"eq.{cnes}"},
        limit=1,
    )
    if not units:
        raise HTTPException(status_code=404, detail="O CRE relacionado não foi encontrado no cadastro CNES.")
    unit = units[0]
    return {
        "cnes": cnes,
        "nome": unit.get("nome_fantasia") or unit.get("razao_social") or cnes,
        "telefone": unit.get("telefone"),
        "endereco": unit.get("logradouro"),
        "tipo_estabelecimento": unit.get("tipo_estabelecimento"),
        "solicitacao_id": request_id,
        "dispositivo_id": device.get("id") if device else None,
    }


@app.get("/api/patient/devices/current")
async def patient_current_device(identity: Identity = Depends(current_identity)) -> dict[str, Any] | None:
    require_roles(identity, "PACIENTE")
    if not identity.paciente_id:
        return None
    devices = await _patient_device_rows(identity.paciente_id)
    return await _hydrate_device(devices[0]) if devices else None


@app.get("/api/patient/devices/{device_id}/history")
async def patient_device_history(device_id: int, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "PACIENTE")
    if not identity.paciente_id:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
    devices = await db_select(
        "producao",
        "dispositivo_opm",
        filters={"id": f"eq.{device_id}", "paciente_id": f"eq.{identity.paciente_id}"},
        limit=1,
    )
    if not devices:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado.")
    device = await _hydrate_device(devices[0])
    usages = await db_select(
        "producao",
        "uso_dispositivo",
        filters={"dispositivo_id": f"eq.{device_id}"},
        order="inicio_uso.desc",
        limit=5000,
    )
    enriched_usages: list[dict[str, Any]] = []
    for usage in usages:
        minutes = 0
        try:
            start = datetime.fromisoformat(str(usage["inicio_uso"]).replace("Z", "+00:00"))
            end = datetime.fromisoformat(str(usage["fim_uso"]).replace("Z", "+00:00"))
            minutes = max(0, int((end - start).total_seconds() // 60))
        except (KeyError, TypeError, ValueError):
            pass
        enriched_usages.append({**usage, "duracao_minutos": minutes})
    total_minutes = sum(item["duracao_minutos"] for item in enriched_usages)
    return {
        "device": device,
        "summary": {
            "numero_usos": len(enriched_usages),
            "tempo_total_uso_minutos": total_minutes,
            "tempo_medio_uso_minutos": round(total_minutes / len(enriched_usages)) if enriched_usages else 0,
            "primeiro_uso_em": enriched_usages[-1].get("inicio_uso") if enriched_usages else None,
            "ultimo_uso_em": enriched_usages[0].get("inicio_uso") if enriched_usages else None,
        },
        "usages": enriched_usages,
    }


@app.get("/api/patient/support/context")
async def patient_support_context(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "PACIENTE")
    return await _patient_related_cre(identity)


class PatientSupportCreate(BaseModel):
    categoria: Literal["DOR", "MANUTENCAO", "DUVIDA", "SUPORTE", "OUTRO"] = "SUPORTE"
    gravidade: Literal["NAO_INFORMADA", "LEVE", "MODERADA", "INTENSA"] = "NAO_INFORMADA"
    canal: Literal["MENSAGEM", "CONTATO_DIRETO"] = "MENSAGEM"
    assunto: str = Field(min_length=3, max_length=255)
    mensagem: str | None = Field(default=None, max_length=3000)

    @field_validator("assunto", "mensagem", mode="before")
    @classmethod
    def clean_support_text(cls, value: Any) -> Any:
        if value is None:
            return None
        return clean_text(value, field="Mensagem", required=False, max_length=3000)


class SupportMessageCreate(BaseModel):
    mensagem: str = Field(min_length=1, max_length=3000)

    @field_validator("mensagem", mode="before")
    @classmethod
    def clean_message(cls, value: Any) -> str:
        return clean_text(value, field="Mensagem", required=True, max_length=3000) or ""


async def _notify_cre_support(cnes: str, title: str, message: str, ticket_id: int, urgent: bool = False) -> None:
    users = await db_select(
        "app",
        "usuario_sistema",
        select="auth_user_id,papel,cnes_vinculo,ativo",
        filters={
            "cnes_vinculo": f"eq.{cnes}",
            "papel": "eq.FISCAL_CRE",
            "ativo": "eq.true",
        },
        limit=500,
    )
    rows = [
        {
            "auth_user_id": user["auth_user_id"],
            "tipo": "URGENTE" if urgent else "ALERTA",
            "titulo": title,
            "mensagem": message,
            "referencia_tabela": "app.atendimento_paciente",
            "referencia_id": ticket_id,
            "destino_ui": "cre_support",
        }
        for user in users
        if user.get("papel") == "FISCAL_CRE"
    ]
    if rows:
        await db_insert("app", "notificacao", rows)


@app.get("/api/patient/support/tickets")
async def patient_support_tickets(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    require_roles(identity, "PACIENTE")
    if not identity.paciente_id:
        return []
    tickets = await db_select(
        "app",
        "atendimento_paciente",
        filters={"paciente_id": f"eq.{identity.paciente_id}"},
        order="atualizado_em.desc",
        limit=100,
    )
    for ticket in tickets:
        messages = await db_select(
            "app",
            "atendimento_mensagem",
            filters={"atendimento_id": f"eq.{ticket['id']}"},
            order="criado_em.desc",
            limit=1,
        )
        ticket["ultima_mensagem"] = messages[0] if messages else None
    return tickets


@app.post("/api/patient/support/tickets", status_code=201)
async def create_patient_support_ticket(payload: PatientSupportCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "PACIENTE")
    if not identity.paciente_id:
        raise HTTPException(status_code=422, detail="O paciente não possui vínculo cadastrado.")
    context = await _patient_related_cre(identity)
    default_message = (
        "Paciente informou dor ou desconforto e optou por entrar em contato diretamente com o CRE por telefone."
        if payload.canal == "CONTATO_DIRETO" and payload.categoria == "DOR"
        else "Paciente solicitou contato direto com o CRE."
    )
    message = payload.mensagem or default_message
    rows = await db_insert(
        "app",
        "atendimento_paciente",
        {
            "paciente_id": identity.paciente_id,
            "cnes_destino": context["cnes"],
            "solicitacao_id": context.get("solicitacao_id"),
            "dispositivo_id": context.get("dispositivo_id"),
            "categoria": payload.categoria,
            "gravidade": payload.gravidade,
            "canal": payload.canal,
            "assunto": payload.assunto,
            "status": "ABERTO",
            "criado_por": identity.auth_user_id,
        },
    )
    if not rows:
        raise HTTPException(status_code=502, detail="Não foi possível registrar o atendimento.")
    ticket = rows[0]
    await db_insert(
        "app",
        "atendimento_mensagem",
        {
            "atendimento_id": ticket["id"],
            "autor_auth_user_id": identity.auth_user_id,
            "autor_papel": "PACIENTE",
            "mensagem": message,
            "orientacao": "NENHUMA",
        },
    )
    title = "Paciente relatou dor/desconforto" if payload.categoria == "DOR" else "Nova mensagem de paciente"
    await _notify_cre_support(
        context["cnes"],
        title,
        f"{identity.nome_exibicao}: {message[:350]}",
        ticket["id"],
        urgent=payload.gravidade == "INTENSA",
    )
    return {**ticket, "cre": context}


@app.get("/api/patient/support/tickets/{ticket_id}/messages")
async def patient_support_messages(ticket_id: int, identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    require_roles(identity, "PACIENTE")
    tickets = await db_select(
        "app",
        "atendimento_paciente",
        select="id",
        filters={"id": f"eq.{ticket_id}", "paciente_id": f"eq.{identity.paciente_id}"},
        limit=1,
    )
    if not tickets:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado.")
    return await db_select("app", "atendimento_mensagem", filters={"atendimento_id": f"eq.{ticket_id}"}, order="criado_em.asc", limit=500)


@app.post("/api/patient/support/tickets/{ticket_id}/messages", status_code=201)
async def patient_support_reply(ticket_id: int, payload: SupportMessageCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "PACIENTE")
    tickets = await db_select(
        "app",
        "atendimento_paciente",
        filters={"id": f"eq.{ticket_id}", "paciente_id": f"eq.{identity.paciente_id}"},
        limit=1,
    )
    if not tickets:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado.")
    ticket = tickets[0]
    rows = await db_insert("app", "atendimento_mensagem", {
        "atendimento_id": ticket_id,
        "autor_auth_user_id": identity.auth_user_id,
        "autor_papel": "PACIENTE",
        "mensagem": payload.mensagem,
        "orientacao": "NENHUMA",
    })
    await db_update("app", "atendimento_paciente", {"id": f"eq.{ticket_id}"}, {"status": "ABERTO", "atualizado_em": datetime.utcnow().isoformat()})
    await _notify_cre_support(ticket["cnes_destino"], "Paciente respondeu ao atendimento", f"{identity.nome_exibicao}: {payload.mensagem[:350]}", ticket_id)
    return rows[0]


class CreSupportReply(BaseModel):
    mensagem: str = Field(min_length=1, max_length=3000)
    orientacao: Literal["SEM_ACAO", "COMPARECER_CRE", "PROCURAR_HOSPITAL", "PERSONALIZADA"] = "PERSONALIZADA"
    encerrar: bool = False

    @field_validator("mensagem", mode="before")
    @classmethod
    def clean_cre_message(cls, value: Any) -> str:
        return clean_text(value, field="Resposta", required=True, max_length=3000) or ""


@app.get("/api/cre/support/tickets")
async def cre_support_tickets(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    require_roles(identity, "FISCAL_CRE")
    if not identity.cnes_vinculo:
        raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
    filters = {"cnes_destino": f"eq.{identity.cnes_vinculo}"}
    tickets = await db_select("app", "atendimento_paciente", filters=filters, order="atualizado_em.desc", limit=500)
    patient_ids = sorted({ticket.get("paciente_id") for ticket in tickets if ticket.get("paciente_id")})
    patients: dict[int, dict[str, Any]] = {}
    if patient_ids:
        rows = await db_select("fila", "paciente", select="id,nome_completo,cns,telefone_contato", filters={"id": f"in.({','.join(map(str, patient_ids))})"}, limit=1000)
        patients = {row["id"]: row for row in rows}
    for ticket in tickets:
        ticket["paciente"] = patients.get(ticket.get("paciente_id"))
        latest = await db_select("app", "atendimento_mensagem", filters={"atendimento_id": f"eq.{ticket['id']}"}, order="criado_em.desc", limit=1)
        ticket["ultima_mensagem"] = latest[0] if latest else None
    return tickets


async def _ensure_cre_ticket_access(ticket_id: int, identity: Identity) -> dict[str, Any]:
    if not identity.cnes_vinculo:
        raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
    filters = {
        "id": f"eq.{ticket_id}",
        "cnes_destino": f"eq.{identity.cnes_vinculo}",
    }
    rows = await db_select("app", "atendimento_paciente", filters=filters, limit=1)
    if not rows:
        raise HTTPException(status_code=404, detail="Atendimento não encontrado para esta unidade.")
    return rows[0]


@app.get("/api/cre/support/tickets/{ticket_id}/messages")
async def cre_support_messages(ticket_id: int, identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    require_roles(identity, "FISCAL_CRE")
    await _ensure_cre_ticket_access(ticket_id, identity)
    return await db_select("app", "atendimento_mensagem", filters={"atendimento_id": f"eq.{ticket_id}"}, order="criado_em.asc", limit=500)


@app.post("/api/cre/support/tickets/{ticket_id}/messages", status_code=201)
async def cre_support_reply(ticket_id: int, payload: CreSupportReply, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE")
    ticket = await _ensure_cre_ticket_access(ticket_id, identity)
    rows = await db_insert("app", "atendimento_mensagem", {
        "atendimento_id": ticket_id,
        "autor_auth_user_id": identity.auth_user_id,
        "autor_papel": identity.papel,
        "mensagem": payload.mensagem,
        "orientacao": payload.orientacao,
    })
    new_status = "ENCERRADO" if payload.encerrar else "ORIENTADO"
    await db_update("app", "atendimento_paciente", {"id": f"eq.{ticket_id}"}, {"status": new_status, "atualizado_em": datetime.utcnow().isoformat()})
    patient_users = await db_select("app", "usuario_sistema", select="auth_user_id", filters={"paciente_id": f"eq.{ticket['paciente_id']}", "ativo": "eq.true"}, limit=10)
    notice_type = "URGENTE" if payload.orientacao == "PROCURAR_HOSPITAL" else "INFO"
    notification_rows = [{
        "auth_user_id": row["auth_user_id"],
        "tipo": notice_type,
        "titulo": "Resposta do seu CRE",
        "mensagem": payload.mensagem[:500],
        "referencia_tabela": "app.atendimento_paciente",
        "referencia_id": ticket_id,
        "destino_ui": "patient_support",
    } for row in patient_users]
    if notification_rows:
        await db_insert("app", "notificacao", notification_rows)
    return rows[0]


# -----------------------------------------------------------------------------
# Painel CRE: as views já deixam as respostas prontas para o frontend.
# -----------------------------------------------------------------------------

async def cre_identity(identity: Identity) -> Identity:
    require_roles(identity, "FISCAL_CRE")
    if not identity.cnes_vinculo:
        raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
    return identity


@app.get("/api/cre/kpis")
async def cre_kpis(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo).strip()
    rows = await db_select(
        "fila",
        "vw_kpi_cre",
        filters={"cre_destino_cnes": f"eq.{cnes}"},
        limit=1,
    )
    if not rows:
        return {"fila_ativa": 0, "estoque_proteses": 0, "em_logistica_reversa": 0, "matchings_mes": 0}
    return {
        "fila_ativa": int(rows[0].get("fila_ativa") or 0),
        "estoque_proteses": int(rows[0].get("estoque_proteses") or 0),
        "em_logistica_reversa": int(rows[0].get("em_logistica_reversa") or 0),
        "matchings_mes": int(rows[0].get("matchings_mes") or 0),
    }


@app.get("/api/cre/alerts")
async def cre_alerts(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo or "").strip()
    if not cnes:
        return []

    workshops = await db_select(
        "producao", "oficina_ortopedica",
        select="id,nome,cnes", filters={"cnes": f"eq.{cnes}", "ativo": "eq.true"}, limit=20,
    )
    workshop_ids = [int(row["id"]) for row in workshops if row.get("id") is not None]
    local_stock: list[dict[str, Any]] = []
    if workshop_ids:
        local_stock = await db_select(
            "producao", "material_estoque",
            select="id,oficina_id,codigo_catmat,quantidade_atual,quantidade_minima,unidade_medida",
            filters={"oficina_id": f"in.({','.join(map(str, workshop_ids))})"}, limit=5000,
        )
    low_stock = [
        row for row in local_stock
        if float(row.get("quantidade_atual") or 0) <= float(row.get("quantidade_minima") or 0)
    ]
    catmat_codes = sorted({str(row.get("codigo_catmat") or "").strip() for row in low_stock if row.get("codigo_catmat")})
    catmat_rows = await db_select(
        "dominio", "catmat_item", select="codigo_catmat,descricao",
        filters={"codigo_catmat": f"in.({','.join(catmat_codes)})"}, limit=5000,
    ) if catmat_codes else []
    catmat_name = {str(row.get("codigo_catmat") or "").strip(): row.get("descricao") for row in catmat_rows}
    workshop_name = {int(row["id"]): row.get("nome") for row in workshops if row.get("id") is not None}

    local_patients = await db_select(
        "fila", "vw_pacientes_cre",
        select="solicitacao_id,dias_espera_efetivos",
        filters={"cre_destino_cnes": f"eq.{cnes}"}, limit=5000,
    )
    long_wait = sum(1 for row in local_patients if float(row.get("dias_espera_efetivos") or 0) > 30)

    generated = datetime.now().isoformat()
    result: list[dict[str, Any]] = [
        {
            "tipo": "ESTOQUE",
            "mensagem": (
                f"Estoque crítico: {catmat_name.get(str(row.get('codigo_catmat') or '').strip()) or row.get('codigo_catmat')} "
                f"({row.get('quantidade_atual')} / mínimo {row.get('quantidade_minima')} {row.get('unidade_medida') or ''}) "
                f"em {workshop_name.get(int(row.get('oficina_id') or 0), 'seu CRE')}"
            ),
            "gerado_em": generated,
            "target": "cre_logistics",
        }
        for row in low_stock
    ]
    if long_wait:
        result.append({
            "tipo": "FILA_LONGA",
            "mensagem": f"{long_wait} pacientes deste CRE aguardam há mais de 30 dias.",
            "gerado_em": generated,
            "target": "cre_patients",
        })
    return result


async def _cre_local_lots(cnes: str) -> tuple[set[str], int]:
    workshops = await db_select(
        "producao", "oficina_ortopedica",
        select="id", filters={"cnes": f"eq.{cnes}", "ativo": "eq.true"}, limit=20,
    )
    workshop_ids = [int(row["id"]) for row in workshops if row.get("id") is not None]
    if not workshop_ids:
        return set(), 0

    local_lots: set[str] = set()
    physical = await db_select(
        "producao", "estoque_dispositivo", select="id,lote_fabricante",
        filters={"oficina_id": f"in.({','.join(map(str, workshop_ids))})"}, limit=5000,
    )
    local_lots.update(
        str(row.get("lote_fabricante") or "").strip()
        for row in physical if row.get("lote_fabricante")
    )

    stock = await db_select(
        "producao", "material_estoque", select="id",
        filters={"oficina_id": f"in.({','.join(map(str, workshop_ids))})"}, limit=5000,
    )
    material_ids = [int(row["id"]) for row in stock if row.get("id") is not None]
    if material_ids:
        movements = await db_select(
            "producao", "movimentacao_estoque", select="lote_fabricante",
            filters={"material_estoque_id": f"in.({','.join(map(str, material_ids))})"}, limit=5000,
        )
        local_lots.update(
            str(row.get("lote_fabricante") or "").strip()
            for row in movements if row.get("lote_fabricante")
        )
    local_lots.discard("")
    return local_lots, len(physical)


@app.get("/api/cre/recalls")
async def cre_recalls(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo).strip()
    local_lots, _ = await _cre_local_lots(cnes)
    if not local_lots:
        return []
    recalls = await db_select("app", "recall", order="data_abertura.desc", limit=100)
    return [row for row in recalls if str(row.get("codigo_lote") or "").strip() in local_lots]


@app.get("/api/cre/flow")
async def cre_flow(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo).strip()
    return await db_select(
        "fila", "vw_fluxo_dispositivos_mensal",
        filters={"cre_destino_cnes": f"eq.{cnes}"}, order="mes.asc",
    )


@app.get("/api/cre/patients")
async def cre_patients(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo).strip()
    return await db_select(
        "fila",
        "vw_pacientes_cre",
        filters={"cre_destino_cnes": f"eq.{cnes}"},
        order="data_solicitacao.desc",
        limit=5000,
    )


@app.get("/api/cre/lots")
async def cre_lots(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo).strip()
    return await db_select(
        "producao", "vw_lotes_recentes",
        filters={"cre_cnes": f"eq.{cnes}"}, order="data_cadastro.desc", limit=50,
    )


@app.get("/api/cre/triages")
async def cre_triages(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo).strip()
    return await db_select(
        "fila",
        "vw_triagens",
        filters={"cre_destino_cnes": f"eq.{cnes}"},
        order="data_hora.desc",
        limit=200,
    )


@app.get("/api/cre/shipments")
async def cre_shipments(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo).strip()
    return await db_select(
        "producao", "vw_remessas_logistica",
        filters={"cre_cnes": f"eq.{cnes}"}, order="data_criacao.desc", limit=200,
    )


@app.get("/api/cre/reports")
async def cre_reports(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo).strip()
    return await db_select(
        "fila", "vw_relatorio_mensal",
        filters={"cre_destino_cnes": f"eq.{cnes}"}, order="mes.asc",
    )



# -----------------------------------------------------------------------------
# Matching nacional de dispositivos reaproveitáveis
# -----------------------------------------------------------------------------

MATCHING_PRIORITY_RULES = ("DISTANCIA_KM",)  # área deliberadamente isolada para futuras prioridades


async def _notify_auth_users(rows: list[dict[str, Any]], *, tipo: str, titulo: str, mensagem: str, referencia_id: int, destino_ui: str) -> None:
    payload = [
        {
            "auth_user_id": row["auth_user_id"],
            "tipo": tipo,
            "titulo": titulo,
            "mensagem": mensagem,
            "referencia_tabela": "producao.matching_dispositivo",
            "referencia_id": referencia_id,
            "destino_ui": destino_ui,
        }
        for row in rows if row.get("auth_user_id")
    ]
    if payload:
        await db_insert("app", "notificacao", payload)


async def _notify_new_matching(match: dict[str, Any]) -> None:
    source_cnes = str(match.get("cre_origem_cnes") or "").strip()
    destination_cnes = str(match.get("cre_destino_cnes") or "").strip()
    distance = match.get("distancia_km")
    distance_text = f"{distance} km" if distance is not None else "distância não informada"
    source_users = await db_select(
        "app", "usuario_sistema", select="auth_user_id",
        filters={"papel": "eq.FISCAL_CRE", "cnes_vinculo": f"eq.{source_cnes}", "ativo": "eq.true"}, limit=50,
    )
    product = match.get("nome_produto") or f"Produto #{match.get('produto_id')}"
    destination = match.get("cre_destino_nome") or destination_cnes
    await _notify_auth_users(
        source_users, tipo="ALERTA", titulo="Novo matching de reaproveitamento",
        mensagem=f"Uma unidade de {product} do seu estoque deu match com um paciente de {destination} ({distance_text}). Aceitar envio?",
        referencia_id=int(match["matching_id"]), destino_ui="cre_matching",
    )


def _sanitize_matching_for_source(match: dict[str, Any]) -> dict[str, Any]:
    safe = dict(match)
    safe.pop("paciente_id", None)
    safe.pop("paciente_primeiro_nome", None)
    safe.pop("solicitacao_id", None)
    return safe


async def _run_matching_and_notify(visible_cnes: str | None = None) -> list[dict[str, Any]]:
    created = await db_rpc("producao", "fn_gerar_matchings")
    ids = [int(row.get("matching_id")) for row in created if row.get("matching_id") is not None]
    result: list[dict[str, Any]] = []
    for matching_id in ids:
        rows = await db_select("producao", "vw_matchings_cre", filters={"matching_id": f"eq.{matching_id}"}, limit=1)
        if not rows:
            continue
        match = rows[0]
        await _notify_new_matching(match)
        if visible_cnes is None:
            result.append(match)
            continue
        source_cnes = str(match.get("cre_origem_cnes") or "").strip()
        destination_cnes = str(match.get("cre_destino_cnes") or "").strip()
        if visible_cnes not in {source_cnes, destination_cnes}:
            continue
        result.append(_sanitize_matching_for_source(match) if visible_cnes == source_cnes else match)
    return result


class CreInventoryDeviceCreate(BaseModel):
    produto_id: int | None = Field(default=None, ge=1)
    procedimento_sigtap: str | None = None
    nome_produto: str | None = None
    especificacao_tecnica: str | None = None
    numero_serie: str
    modelo_exato: str | None = None
    fabricante: str | None = None
    data_fabricacao: date | None = None
    data_validade: date | None = None
    condicao: Literal["NOVO", "OCIOSO", "RECONDICIONADO", "DANIFICADO", "VENCIDO"] = "OCIOSO"
    destino_reaproveitamento: Literal["CLINICO", "FUNDICAO", "PECAS_COMPONENTES", "DESCARTE"] = "CLINICO"
    apto_reuso: bool = True
    observacao: str | None = None

    @field_validator("procedimento_sigtap", mode="before")
    @classmethod
    def validate_inventory_procedure(cls, value: Any) -> str | None:
        return normalize_sigtap(value, required=False, opm_only=True)

    @field_validator("numero_serie", mode="before")
    @classmethod
    def validate_inventory_serial(cls, value: Any) -> str:
        result = clean_text(value, field="Número de série", required=True, max_length=120)
        assert result is not None
        return result

    @field_validator("nome_produto", "modelo_exato", "fabricante", "especificacao_tecnica", "observacao", mode="before")
    @classmethod
    def validate_inventory_text(cls, value: Any) -> str | None:
        return clean_text(value, field="Produto", required=False, max_length=1000)


@app.get("/api/cre/matching")
async def cre_matching(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    await cre_identity(identity)
    cnes = str(identity.cnes_vinculo).strip()
    offices = await db_select("producao", "oficina_ortopedica", select="id,cnes,nome", filters={"cnes": f"eq.{cnes}", "ativo": "eq.true"}, limit=1)
    if not offices:
        raise HTTPException(status_code=422, detail="Este CRE não possui oficina ortopédica ativa.")
    office_id = int(offices[0]["id"])
    inventory = await db_select("producao", "vw_estoque_dispositivos_cre", filters={"oficina_id": f"eq.{office_id}"}, order="cadastrado_em.desc", limit=500)
    source_matches = await db_select("producao", "vw_matchings_cre", filters={"cre_origem_cnes": f"eq.{cnes}"}, order="criado_em.desc", limit=500)
    source_matches = [_sanitize_matching_for_source(row) for row in source_matches]
    destination_matches = await db_select("producao", "vw_matchings_cre", filters={"cre_destino_cnes": f"eq.{cnes}"}, order="criado_em.desc", limit=500)
    products = await db_select("producao", "produto_ortese", select="id,procedimento_sigtap,nome_produto,especificacao_tecnica,ativo", filters={"ativo": "eq.true"}, order="nome_produto.asc", limit=1000)
    procedures = await db_select("dominio", "sigtap_procedimento", select="codigo,nome_procedimento", filters={"ativo": "eq.true"}, order="nome_procedimento.asc", limit=1000)
    return {"inventory": inventory, "outgoing": source_matches, "incoming": destination_matches, "products": products, "procedures": procedures}


@app.post("/api/cre/inventory/devices", status_code=201)
async def create_cre_inventory_device(payload: CreInventoryDeviceCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE")
    if not identity.cnes_vinculo:
        raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
    cnes = str(identity.cnes_vinculo).strip()
    offices = await db_select("producao", "oficina_ortopedica", select="id,cnes", filters={"cnes": f"eq.{cnes}", "ativo": "eq.true"}, limit=1)
    if not offices:
        raise HTTPException(status_code=422, detail="Este CRE não possui oficina ortopédica ativa.")
    product: dict[str, Any] | None = None
    if payload.produto_id:
        rows = await db_select("producao", "produto_ortese", select="id,procedimento_sigtap,nome_produto,ativo", filters={"id": f"eq.{payload.produto_id}", "ativo": "eq.true"}, limit=1)
        product = rows[0] if rows else None
    else:
        if not payload.procedimento_sigtap or not payload.nome_produto:
            raise HTTPException(status_code=422, detail="Selecione um produto existente ou informe procedimento e nome para cadastrar um novo produto.")
        rows = await db_select("producao", "produto_ortese", select="id,procedimento_sigtap,nome_produto,ativo", filters={"procedimento_sigtap": f"eq.{payload.procedimento_sigtap}", "nome_produto": f"eq.{payload.nome_produto}", "ativo": "eq.true"}, limit=1)
        if rows:
            product = rows[0]
        else:
            created_product = await db_insert("producao", "produto_ortese", {
                "procedimento_sigtap": payload.procedimento_sigtap,
                "nome_produto": payload.nome_produto,
                "especificacao_tecnica": payload.especificacao_tecnica,
                "ativo": True,
            })
            product = created_product[0]
    if not product:
        raise HTTPException(status_code=422, detail="Produto OPM não encontrado.")
    expired = payload.data_validade is not None and payload.data_validade < date.today()
    condition = "VENCIDO" if expired else payload.condicao
    clinically_unsafe = condition in {"DANIFICADO", "VENCIDO"}
    reuse_route = payload.destino_reaproveitamento
    if clinically_unsafe and reuse_route == "CLINICO":
        raise HTTPException(status_code=422, detail="Dispositivos danificados ou vencidos não podem voltar ao uso clínico. Selecione fundição, aproveitamento de peças/componentes ou descarte.")
    if reuse_route == "DESCARTE":
        reusable = False
        status_value = "BLOQUEADO"
    elif reuse_route in {"FUNDICAO", "PECAS_COMPONENTES"}:
        reusable = True
        status_value = "DISPONIVEL"
    else:
        reusable = payload.apto_reuso
        status_value = "DISPONIVEL" if reusable else "BLOQUEADO"
    device = (await db_insert("producao", "estoque_dispositivo", {
        "oficina_id": offices[0]["id"],
        "produto_id": product["id"],
        "numero_serie": payload.numero_serie,
        "modelo_exato": payload.modelo_exato,
        "fabricante": payload.fabricante,
        "data_fabricacao": payload.data_fabricacao.isoformat() if payload.data_fabricacao else None,
        "data_validade": payload.data_validade.isoformat() if payload.data_validade else None,
        "condicao": condition,
        "destino_reaproveitamento": reuse_route,
        "status": status_value,
        "apto_reuso": reusable,
        "observacao": payload.observacao,
    }))[0]
    eligible_for_patient = reuse_route == "CLINICO" and not clinically_unsafe and reusable
    created_matches = await _run_matching_and_notify(cnes) if eligible_for_patient else []
    return {"device": device, "product": product, "new_matches": created_matches}


class InventoryReuseRoutePatch(BaseModel):
    destino_reaproveitamento: Literal["CLINICO", "FUNDICAO", "PECAS_COMPONENTES", "DESCARTE"]


@app.patch("/api/cre/inventory/devices/{device_id}/reuse-route")
async def update_inventory_reuse_route(device_id: int, payload: InventoryReuseRoutePatch, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE")
    cnes = str(identity.cnes_vinculo or "").strip()
    offices = await db_select("producao", "oficina_ortopedica", select="id", filters={"cnes": f"eq.{cnes}", "ativo": "eq.true"}, limit=1)
    if not offices:
        raise HTTPException(status_code=422, detail="Este CRE não possui oficina ortopédica ativa.")
    rows = await db_select(
        "producao", "estoque_dispositivo",
        select="id,oficina_id,condicao,data_validade,status",
        filters={"id": f"eq.{device_id}", "oficina_id": f"eq.{offices[0]['id']}"}, limit=1,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Dispositivo não encontrado no estoque deste CRE.")
    device = rows[0]
    if device.get("status") in {"RESERVADO", "EM_TRANSFERENCIA", "UTILIZADO"}:
        raise HTTPException(status_code=409, detail="O destino de reaproveitamento não pode ser alterado enquanto o dispositivo está reservado, em transferência ou já utilizado.")
    expired = bool(device.get("data_validade") and str(device.get("data_validade"))[:10] < date.today().isoformat())
    unsafe = device.get("condicao") in {"DANIFICADO", "VENCIDO"} or expired
    if unsafe and payload.destino_reaproveitamento == "CLINICO":
        raise HTTPException(status_code=422, detail="Dispositivos danificados ou vencidos só podem seguir para fundição, peças/componentes ou descarte.")
    reusable = payload.destino_reaproveitamento != "DESCARTE"
    updated = await db_update(
        "producao", "estoque_dispositivo",
        {"id": f"eq.{device_id}", "oficina_id": f"eq.{offices[0]['id']}"},
        {
            "destino_reaproveitamento": payload.destino_reaproveitamento,
            "apto_reuso": reusable,
            "status": "DISPONIVEL" if reusable else "BLOQUEADO",
            "atualizado_em": datetime.now().isoformat(),
        },
    )
    created = await _run_matching_and_notify(cnes) if payload.destino_reaproveitamento == "CLINICO" and not unsafe else []
    return {"device": updated[0] if updated else device, "new_matches": created}


class MatchingDecision(BaseModel):
    action: Literal["ACCEPT", "REJECT"]
    motivo: str | None = None

    @field_validator("motivo", mode="before")
    @classmethod
    def validate_matching_reason(cls, value: Any) -> str | None:
        return clean_text(value, field="Motivo", required=False, max_length=1000)


@app.patch("/api/cre/matching/{matching_id}")
async def decide_matching(matching_id: int, payload: MatchingDecision, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE")
    cnes = str(identity.cnes_vinculo or "").strip()
    if not cnes:
        raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")

    rows = await db_select(
        "producao", "vw_matchings_cre",
        filters={"matching_id": f"eq.{matching_id}", "cre_origem_cnes": f"eq.{cnes}"},
        limit=1,
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Matching não encontrado para este CRE.")
    match = rows[0]
    if match.get("status") != "PROPOSTO":
        raise HTTPException(status_code=409, detail="Este matching já foi respondido.")
    if payload.action == "REJECT" and not (payload.motivo or "").strip():
        raise HTTPException(status_code=422, detail="Informe o motivo da recusa.")

    result = await db_rpc("producao", "fn_responder_matching", {
        "p_matching_id": matching_id,
        "p_cre_origem_cnes": cnes,
        "p_acao": payload.action,
        "p_motivo": payload.motivo,
    })
    if not result:
        raise HTTPException(status_code=502, detail="O matching não retornou resultado após a atualização.")
    response = result[0]

    if response.get("status") == "RECUSADO":
        await _run_matching_and_notify()
        return response

    destination_users = await db_select(
        "app", "usuario_sistema", select="auth_user_id",
        filters={
            "papel": "eq.FISCAL_CRE",
            "cnes_vinculo": f"eq.{str(match.get('cre_destino_cnes') or '').strip()}",
            "ativo": "eq.true",
        },
        limit=50,
    )
    message = f"O CRE {match.get('cre_origem_nome') or match.get('cre_origem_cnes')} aceitou enviar {match.get('nome_produto')} para {match.get('cre_destino_nome') or match.get('cre_destino_cnes')}."
    await _notify_auth_users(
        destination_users, tipo="INFO", titulo="Matching aceito pelo CRE de origem",
        mensagem=message, referencia_id=matching_id, destino_ui="cre_matching",
    )
    return response


# -----------------------------------------------------------------------------
# Catálogos e cadastros
# -----------------------------------------------------------------------------

@app.get("/api/admin/catalogs")
async def catalogs(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE", "GESTOR")
    if identity.papel == "FISCAL_CRE":
        if not identity.cnes_vinculo:
            raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
        procedures = await db_select(
            "dominio", "sigtap_procedimento",
            select="codigo,nome_procedimento",
            filters={"ativo": "eq.true"}, order="nome_procedimento.asc", limit=500,
        )
        return {
            "patients": [],
            "professionals": [],
            "units": [],
            "municipalities": [],
            "procedures": procedures,
            "diagnoses": [],
            "workshops": [],
            "materials": [],
            "providers": [],
            "products": [],
            "pending_requests": [],
            "cres": [],
        }
    patients, professionals, units, municipalities, procedures, diagnoses, workshops, materials, providers, products = await _gather_catalogs()

    pending_requests = await db_select(
        "fila",
        "solicitacao_ortese",
        select="id,paciente_id,procedimento_sigtap,produto_id,estabelecimento_solicitante_cnes,data_solicitacao,prioridade_clinica,status",
        filters={"status": "eq.AGUARDANDO_AUTORIZACAO"},
        order="data_solicitacao.asc",
        limit=500,
    )
    patient_by_id = {int(row["id"]): row for row in patients if row.get("id") is not None}
    procedure_by_code = {str(row.get("codigo")): row for row in procedures}
    unit_by_cnes = {str(row.get("codigo_cnes")): row for row in units}
    workshop_by_cnes = {str(row.get("cnes")): row for row in workshops}

    for request_row in pending_requests:
        patient = patient_by_id.get(int(request_row.get("paciente_id") or 0), {})
        procedure = procedure_by_code.get(str(request_row.get("procedimento_sigtap") or ""), {})
        ubs = unit_by_cnes.get(str(request_row.get("estabelecimento_solicitante_cnes") or ""), {})
        request_row["paciente_nome"] = patient.get("nome_completo")
        request_row["paciente_cns"] = patient.get("cns")
        request_row["procedimento_nome"] = procedure.get("nome_procedimento")
        request_row["ubs_nome"] = ubs.get("nome_fantasia") or ubs.get("razao_social")

    cres: list[dict[str, Any]] = []
    for cnes, workshop in workshop_by_cnes.items():
        unit = unit_by_cnes.get(cnes, {})
        if unit and unit.get("ativo") is False:
            continue
        cres.append({
            "codigo_cnes": cnes,
            "nome": unit.get("nome_fantasia") or workshop.get("nome") or unit.get("razao_social") or cnes,
            "oficina_id": workshop.get("id"),
            "capacidade_producao_mensal": workshop.get("capacidade_producao_mensal"),
            "municipio_ibge6": unit.get("municipio_ibge6"),
            "telefone": unit.get("telefone"),
        })
    cres.sort(key=lambda row: str(row.get("nome") or ""))

    return {
        "patients": patients,
        "professionals": professionals,
        "units": units,
        "municipalities": municipalities,
        "procedures": procedures,
        "diagnoses": diagnoses,
        "workshops": workshops,
        "materials": materials,
        "providers": providers,
        "products": products,
        "pending_requests": pending_requests,
        "cres": cres,
    }


async def _gather_catalogs() -> tuple[list[dict[str, Any]], ...]:
    import asyncio

    return tuple(await asyncio.gather(
        db_select("fila", "paciente", select="id,nome_completo,cns,cpf", order="nome_completo.asc", limit=500),
        db_select("fila", "profissional_saude", select="id,nome_completo,cns,cbo,cnes_vinculo", order="nome_completo.asc", limit=500),
        db_select("dominio", "estabelecimento_cnes", select="codigo_cnes,cnpj_mantenedora,nome_fantasia,razao_social,tipo_estabelecimento,municipio_ibge6,logradouro,telefone,habilitado_opm,ativo", filters={"ativo": "eq.true"}, order="nome_fantasia.asc", limit=500),
        db_select("dominio", "municipio_ibge", select="codigo_ibge6,nome_municipio,uf_sigla", order="nome_municipio.asc", limit=1000),
        db_select("dominio", "sigtap_procedimento", select="codigo,nome_procedimento", filters={"ativo": "eq.true"}, order="nome_procedimento.asc", limit=500),
        db_select("dominio", "cid10", select="codigo,descricao", order="descricao.asc", limit=1000),
        db_select("producao", "oficina_ortopedica", select="id,cnes,nome,capacidade_producao_mensal,responsavel_tecnico_id,ativo", filters={"ativo": "eq.true"}, order="nome.asc", limit=500),
        db_select("producao", "material_estoque", select="id,oficina_id,codigo_catmat,quantidade_atual,quantidade_minima,unidade_medida", order="id.asc", limit=500),
        db_select("app", "fornecedor", order="nome.asc", limit=500),
        db_select("producao", "produto_ortese", select="id,procedimento_sigtap,nome_produto,especificacao_tecnica,tempo_producao_estimado_dias,ativo", filters={"ativo": "eq.true"}, order="nome_produto.asc", limit=1000),
    ))


@app.get("/api/admin/users")
async def admin_users(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    require_roles(identity, "GESTOR")
    return await db_select("app", "usuario_sistema", order="nome_exibicao.asc", limit=1000)


class PatientIdentityCreate(BaseModel):
    nome_completo: str
    cns: str
    cpf: str | None = None
    data_nascimento: date
    sexo: Literal["M", "F"]
    municipio_residencia_ibge6: str | None = None
    zona_residencia: Literal["URBANA", "RURAL", "RIBEIRINHA", "REMOTA"] = "URBANA"
    telefone_contato: str | None = None
    idioma_preferido: Literal["pt-BR", "en-US", "es-419"] = "pt-BR"

    @field_validator("nome_completo", mode="before")
    @classmethod
    def validate_name(cls, value: Any) -> str:
        result = clean_text(value, field="Nome completo", required=True, max_length=255)
        assert result is not None
        return result

    @field_validator("cns", mode="before")
    @classmethod
    def validate_cns(cls, value: Any) -> str:
        return normalize_cns(value)

    @field_validator("cpf", mode="before")
    @classmethod
    def validate_cpf(cls, value: Any) -> str | None:
        return normalize_cpf(value)

    @field_validator("municipio_residencia_ibge6", mode="before")
    @classmethod
    def validate_municipality(cls, value: Any) -> str | None:
        return normalize_code(value, field="Código IBGE do município", length=6, required=False)

    @field_validator("telefone_contato", mode="before")
    @classmethod
    def validate_phone(cls, value: Any) -> str | None:
        return normalize_phone(value)

    @field_validator("data_nascimento")
    @classmethod
    def validate_birth(cls, value: date) -> date:
        return validate_birth_date(value)




class StaffCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    nome_completo: str
    cns: str
    cpf: str | None = None
    cbo: str
    cnes_vinculo: str
    papel: Literal["FISCAL_CRE", "GESTOR"]
    numero_conselho: str | None = None
    tipo_conselho: str | None = None
    idioma_preferido: Literal["pt-BR", "en-US", "es-419"] = "pt-BR"

    @field_validator("nome_completo", mode="before")
    @classmethod
    def validate_name(cls, value: Any) -> str:
        result = clean_text(value, field="Nome completo", required=True, max_length=255)
        assert result is not None
        return result

    @field_validator("cns", mode="before")
    @classmethod
    def validate_cns(cls, value: Any) -> str:
        return normalize_cns(value)

    @field_validator("cpf", mode="before")
    @classmethod
    def validate_cpf(cls, value: Any) -> str | None:
        return normalize_cpf(value)

    @field_validator("cbo", mode="before")
    @classmethod
    def validate_cbo(cls, value: Any) -> str:
        result = normalize_code(value, field="CBO", length=6)
        assert result is not None
        return result

    @field_validator("cnes_vinculo", mode="before")
    @classmethod
    def validate_cnes(cls, value: Any) -> str:
        result = normalize_code(value, field="CNES", length=7)
        assert result is not None
        return result

    @field_validator("numero_conselho", "tipo_conselho", mode="before")
    @classmethod
    def clean_optional_fields(cls, value: Any) -> str | None:
        return clean_text(value, field="Dados do conselho", max_length=50)


@app.post("/api/admin/staff", status_code=201)
async def create_staff(payload: StaffCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "GESTOR")
    await ensure_unique("fila", "profissional_saude", "cns", payload.cns, "Já existe um profissional com este CNS.")
    await ensure_unique("fila", "profissional_saude", "cpf", payload.cpf, "Já existe um profissional com este CPF.")
    await ensure_record_exists(
        "dominio",
        "cbo",
        "codigo",
        payload.cbo,
        "O CBO informado não existe no catálogo carregado.",
    )
    await ensure_record_exists(
        "dominio",
        "estabelecimento_cnes",
        "codigo_cnes",
        payload.cnes_vinculo,
        "A unidade CNES informada não existe no catálogo carregado.",
        extra_filters={"ativo": "eq.true"},
    )
    professional_rows = await db_insert("fila", "profissional_saude", {
        "cns": payload.cns,
        "cpf": payload.cpf or None,
        "nome_completo": payload.nome_completo,
        "cbo": payload.cbo,
        "cnes_vinculo": payload.cnes_vinculo,
        "numero_conselho": payload.numero_conselho or None,
        "tipo_conselho": payload.tipo_conselho or None,
    })
    professional = professional_rows[0]
    auth_user: dict[str, Any] | None = None
    try:
        auth_user = await create_auth_user(payload.email, payload.password, payload.nome_completo)
        profile_rows = await db_insert("app", "usuario_sistema", {
            "auth_user_id": auth_user["id"],
            "papel": payload.papel,
            "profissional_saude_id": professional["id"],
            "cnes_vinculo": payload.cnes_vinculo,
            "nome_exibicao": payload.nome_completo,
            "idioma_preferido": payload.idioma_preferido,
        })
        return {"professional": professional, "profile": profile_rows[0]}
    except Exception:
        await db_delete("fila", "profissional_saude", {"id": f"eq.{professional['id']}"})
        if auth_user:
            await delete_auth_user(auth_user["id"])
        raise


class ProviderCreate(BaseModel):
    nome: str
    cnpj: str | None = None
    email: EmailStr | None = None
    telefone: str | None = None
    endereco: str | None = None
    numero_contrato: str | None = None
    valor_total: float | None = Field(default=None, ge=0)
    data_inicio: date | None = None
    data_fim: date | None = None
    sla_percentual: float | None = Field(default=None, ge=0, le=100)
    status: Literal["VIGENTE", "EM_RENOVACAO", "ENCERRADO", "CANCELADO"] = "VIGENTE"

    @field_validator("nome", mode="before")
    @classmethod
    def validate_name(cls, value: Any) -> str:
        result = clean_text(value, field="Nome do fornecedor", required=True, max_length=255)
        assert result is not None
        return result

    @field_validator("cnpj", mode="before")
    @classmethod
    def validate_cnpj(cls, value: Any) -> str | None:
        return normalize_cnpj(value)

    @field_validator("telefone", mode="before")
    @classmethod
    def validate_phone(cls, value: Any) -> str | None:
        return normalize_phone(value)

    @field_validator("endereco", mode="before")
    @classmethod
    def validate_address(cls, value: Any) -> str | None:
        return clean_text(value, field="Endereço", max_length=500)

    @field_validator("numero_contrato", mode="before")
    @classmethod
    def validate_contract_number(cls, value: Any) -> str | None:
        return clean_text(value, field="Número do contrato", max_length=100)

    @model_validator(mode="after")
    def validate_contract(self) -> "ProviderCreate":
        validate_date_range(self.data_inicio, self.data_fim, label="contrato")
        has_contract_data = any(
            value is not None
            for value in (self.valor_total, self.data_inicio, self.data_fim, self.sla_percentual)
        ) or self.status != "VIGENTE"
        if has_contract_data and not self.numero_contrato:
            raise ValueError("Informe o número do contrato para cadastrar os dados contratuais.")
        return self


@app.post("/api/admin/providers", status_code=201)
async def create_provider(payload: ProviderCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "GESTOR")
    await ensure_unique("app", "fornecedor", "cnpj", payload.cnpj, "Já existe um fornecedor com este CNPJ.")
    await ensure_unique(
        "app",
        "contrato_fornecedor",
        "numero_contrato",
        payload.numero_contrato,
        "Já existe um contrato com este número.",
    )
    provider_rows = await db_insert("app", "fornecedor", {
        "nome": payload.nome,
        "cnpj": payload.cnpj or None,
        "email": payload.email or None,
        "telefone": payload.telefone or None,
        "endereco": payload.endereco or None,
    })
    provider = provider_rows[0]
    contract = None
    try:
        if payload.numero_contrato:
            contract_rows = await db_insert("app", "contrato_fornecedor", {
                "fornecedor_id": provider["id"],
                "numero_contrato": payload.numero_contrato,
                "valor_total": payload.valor_total,
                "data_inicio": payload.data_inicio.isoformat() if payload.data_inicio else None,
                "data_fim": payload.data_fim.isoformat() if payload.data_fim else None,
                "sla_percentual": payload.sla_percentual,
                "status": payload.status,
            })
            contract = contract_rows[0]
        return {"provider": provider, "contract": contract}
    except Exception:
        await db_delete("app", "fornecedor", {"id": f"eq.{provider['id']}"})
        raise


class DemoPatientCreate(PatientIdentityCreate):
    cpf: str
    estabelecimento_solicitante_cnes: str
    profissional_solicitante_id: int = Field(ge=1)
    procedimento_sigtap: str
    produto_id: int = Field(ge=1)
    cid10_codigo: str
    justificativa_clinica: str
    lado_acometido: Literal["DIREITO", "ESQUERDO", "BILATERAL", "NAO_APLICAVEL"] | None = None
    prioridade_clinica: Literal["ROTINA", "PRIORITARIO", "URGENTE"] = "ROTINA"

    @field_validator("estabelecimento_solicitante_cnes", mode="before")
    @classmethod
    def validate_requesting_unit(cls, value: Any) -> str:
        result = normalize_code(value, field="CNES da UBS solicitante", length=7)
        assert result is not None
        return result

    @field_validator("procedimento_sigtap", mode="before")
    @classmethod
    def validate_procedure(cls, value: Any) -> str:
        result = normalize_sigtap(value, opm_only=True)
        assert result is not None
        return result

    @field_validator("cid10_codigo", mode="before")
    @classmethod
    def validate_diagnosis(cls, value: Any) -> str:
        return normalize_cid10(value)

    @field_validator("justificativa_clinica", mode="before")
    @classmethod
    def validate_justification(cls, value: Any) -> str:
        result = clean_text(value, field="Justificativa clínica", required=True, max_length=4000)
        assert result is not None
        return result


@app.post("/api/admin/demo/patients", status_code=201)
async def create_demo_patient(payload: DemoPatientCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    """Cria paciente + login + solicitação originada na UBS, ainda sem CRE e aguardando SISREG."""
    require_roles(identity, "GESTOR")
    products = await db_select(
        "producao", "produto_ortese",
        select="id,procedimento_sigtap,nome_produto,ativo",
        filters={"id": f"eq.{payload.produto_id}", "ativo": "eq.true"}, limit=1,
    )
    if not products:
        raise HTTPException(status_code=422, detail="O produto OPM selecionado não existe ou está inativo.")
    if str(products[0].get("procedimento_sigtap") or "").strip() != payload.procedimento_sigtap:
        raise HTTPException(status_code=422, detail="O produto selecionado não pertence ao procedimento SIGTAP informado.")
    await ensure_unique("fila", "paciente", "cns", payload.cns, "Já existe um paciente com este CNS.")
    await ensure_unique("fila", "paciente", "cpf", payload.cpf, "Já existe um paciente com este CPF.")
    if payload.municipio_residencia_ibge6:
        await ensure_record_exists("dominio", "municipio_ibge", "codigo_ibge6", payload.municipio_residencia_ibge6, "O município informado não existe no catálogo IBGE carregado.")
    await ensure_record_exists("dominio", "estabelecimento_cnes", "codigo_cnes", payload.estabelecimento_solicitante_cnes, "A UBS solicitante não existe no catálogo CNES.", extra_filters={"ativo": "eq.true"})
    professional_rows = await db_select("fila", "profissional_saude", select="id,cnes_vinculo,ativo", filters={"id": f"eq.{payload.profissional_solicitante_id}"}, limit=1)
    if not professional_rows or professional_rows[0].get("ativo") is False:
        raise HTTPException(status_code=422, detail="O profissional solicitante não existe ou está inativo.")
    if str(professional_rows[0].get("cnes_vinculo") or "") != payload.estabelecimento_solicitante_cnes:
        raise HTTPException(status_code=422, detail="O profissional solicitante precisa estar vinculado à UBS selecionada.")
    await ensure_record_exists("dominio", "sigtap_procedimento", "codigo", payload.procedimento_sigtap, "O procedimento SIGTAP informado não existe ou está inativo.", extra_filters={"ativo": "eq.true"})
    await ensure_record_exists("dominio", "cid10", "codigo", payload.cid10_codigo, "O diagnóstico CID-10 informado não existe no catálogo carregado.")

    patient_rows = await db_insert("fila", "paciente", {
        "cns": payload.cns,
        "cpf": payload.cpf or None,
        "nome_completo": payload.nome_completo,
        "data_nascimento": payload.data_nascimento.isoformat(),
        "sexo": payload.sexo,
        "municipio_residencia_ibge6": payload.municipio_residencia_ibge6 or None,
        "zona_residencia": payload.zona_residencia,
        "telefone_contato": payload.telefone_contato or None,
        "email_contato": None,
    })
    patient = patient_rows[0]
    auth_user: dict[str, Any] | None = None
    request_row: dict[str, Any] | None = None
    try:
        auth_user = await create_auth_user(
            temporary_patient_email(payload.cpf),
            generate_temporary_patient_password(),
            payload.nome_completo,
            metadata={"first_access": True},
        )
        profile_rows = await db_insert("app", "usuario_sistema", {
            "auth_user_id": auth_user["id"],
            "papel": "PACIENTE",
            "paciente_id": patient["id"],
            "nome_exibicao": payload.nome_completo,
            "idioma_preferido": payload.idioma_preferido,
            "primeiro_acesso_concluido": False,
            "primeiro_acesso_em": None,
        })
        requests = await db_insert("fila", "solicitacao_ortese", {
            "paciente_id": patient["id"],
            "procedimento_sigtap": payload.procedimento_sigtap,
            "produto_id": payload.produto_id,
            "cid10_codigo": payload.cid10_codigo,
            "profissional_solicitante_id": payload.profissional_solicitante_id,
            "estabelecimento_solicitante_cnes": payload.estabelecimento_solicitante_cnes,
            "justificativa_clinica": payload.justificativa_clinica,
            "lado_acometido": payload.lado_acometido or None,
            "prioridade_clinica": payload.prioridade_clinica,
            "status": "AGUARDANDO_AUTORIZACAO",
            "cre_destino_cnes": None,
        })
        request_row = requests[0]
        await db_insert("fila", "historico_status_solicitacao", {
            "solicitacao_id": request_row["id"],
            "status_anterior": None,
            "status_novo": "AGUARDANDO_AUTORIZACAO",
            "usuario_responsavel": "UBS / SUS Digital (simulação)",
            "observacao": "Solicitação recebida da atenção básica e encaminhada para autorização SISREG.",
        })
        return {"patient": patient, "profile": profile_rows[0], "request": request_row}
    except Exception:
        if request_row:
            await db_delete("fila", "solicitacao_ortese", {"id": f"eq.{request_row['id']}"})
        if auth_user:
            await delete_auth_user(auth_user["id"])
        await db_delete("fila", "paciente", {"id": f"eq.{patient['id']}"})
        raise


class CreCreate(BaseModel):
    codigo_cnes: str
    cnpj_mantenedora: str | None = None
    razao_social: str
    nome_fantasia: str
    tipo_estabelecimento: str = "CENTRO ESPECIALIZADO EM REABILITACAO"
    municipio_ibge6: str
    logradouro: str
    telefone: str | None = None
    capacidade_producao_mensal: int | None = Field(default=None, ge=0)
    nome_responsavel: str
    email_responsavel: EmailStr
    password_responsavel: str = Field(min_length=6)
    cns_responsavel: str
    cpf_responsavel: str | None = None
    cbo_responsavel: str
    numero_conselho: str | None = None
    tipo_conselho: str | None = None
    idioma_preferido: Literal["pt-BR", "en-US", "es-419"] = "pt-BR"

    @field_validator("codigo_cnes", mode="before")
    @classmethod
    def validate_cnes(cls, value: Any) -> str:
        result = normalize_code(value, field="CNES do CRE", length=7)
        assert result is not None
        return result

    @field_validator("cnpj_mantenedora", mode="before")
    @classmethod
    def validate_cnpj(cls, value: Any) -> str | None:
        return normalize_cnpj(value)

    @field_validator("municipio_ibge6", mode="before")
    @classmethod
    def validate_municipality(cls, value: Any) -> str:
        result = normalize_code(value, field="Município IBGE", length=6)
        assert result is not None
        return result

    @field_validator("telefone", mode="before")
    @classmethod
    def validate_phone(cls, value: Any) -> str | None:
        return normalize_phone(value)

    @field_validator("cns_responsavel", mode="before")
    @classmethod
    def validate_responsible_cns(cls, value: Any) -> str:
        return normalize_cns(value)

    @field_validator("cpf_responsavel", mode="before")
    @classmethod
    def validate_responsible_cpf(cls, value: Any) -> str | None:
        return normalize_cpf(value)

    @field_validator("cbo_responsavel", mode="before")
    @classmethod
    def validate_responsible_cbo(cls, value: Any) -> str:
        result = normalize_code(value, field="CBO do responsável", length=6)
        assert result is not None
        return result

    @field_validator("razao_social", "nome_fantasia", "nome_responsavel", mode="before")
    @classmethod
    def validate_required_text(cls, value: Any) -> str:
        result = clean_text(value, field="Texto", required=True, max_length=255)
        assert result is not None
        return result

    @field_validator("logradouro", mode="before")
    @classmethod
    def validate_address(cls, value: Any) -> str:
        result = clean_text(value, field="Endereço", required=True, max_length=255)
        assert result is not None
        return result


@app.post("/api/admin/cres", status_code=201)
async def create_cre(payload: CreCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "GESTOR")
    await ensure_unique("dominio", "estabelecimento_cnes", "codigo_cnes", payload.codigo_cnes, "Já existe uma unidade com este CNES.")
    await ensure_unique("fila", "profissional_saude", "cns", payload.cns_responsavel, "Já existe um profissional com este CNS.")
    await ensure_unique("fila", "profissional_saude", "cpf", payload.cpf_responsavel, "Já existe um profissional com este CPF.")
    municipality_rows = await db_select(
        "dominio", "municipio_ibge", select="codigo_ibge6,nome_municipio,uf_sigla",
        filters={"codigo_ibge6": f"eq.{payload.municipio_ibge6}"}, limit=1,
    )
    if not municipality_rows:
        raise HTTPException(status_code=422, detail="O município informado não existe no catálogo IBGE.")
    await ensure_record_exists("dominio", "cbo", "codigo", payload.cbo_responsavel, "O CBO do responsável não existe no catálogo carregado.")

    unit: dict[str, Any] | None = None
    professional: dict[str, Any] | None = None
    workshop: dict[str, Any] | None = None
    auth_user: dict[str, Any] | None = None
    try:
        unit = (await db_insert("dominio", "estabelecimento_cnes", {
            "codigo_cnes": payload.codigo_cnes,
            "cnpj_mantenedora": payload.cnpj_mantenedora or None,
            "razao_social": payload.razao_social,
            "nome_fantasia": payload.nome_fantasia,
            "tipo_estabelecimento": payload.tipo_estabelecimento,
            "municipio_ibge6": payload.municipio_ibge6,
            "logradouro": payload.logradouro,
            "telefone": payload.telefone or None,
            "habilitado_opm": True,
            "ativo": True,
        }))[0]
        professional = (await db_insert("fila", "profissional_saude", {
            "cns": payload.cns_responsavel,
            "cpf": payload.cpf_responsavel or None,
            "nome_completo": payload.nome_responsavel,
            "cbo": payload.cbo_responsavel,
            "cnes_vinculo": payload.codigo_cnes,
            "numero_conselho": payload.numero_conselho or None,
            "tipo_conselho": payload.tipo_conselho or None,
        }))[0]
        workshop = (await db_insert("producao", "oficina_ortopedica", {
            "cnes": payload.codigo_cnes,
            "nome": payload.nome_fantasia,
            "capacidade_producao_mensal": payload.capacidade_producao_mensal,
            "responsavel_tecnico_id": professional["id"],
            "ativo": True,
        }))[0]
        auth_user = await create_auth_user(payload.email_responsavel, payload.password_responsavel, payload.nome_responsavel)
        profile = (await db_insert("app", "usuario_sistema", {
            "auth_user_id": auth_user["id"],
            "papel": "FISCAL_CRE",
            "profissional_saude_id": professional["id"],
            "cnes_vinculo": payload.codigo_cnes,
            "nome_exibicao": payload.nome_responsavel,
            "idioma_preferido": payload.idioma_preferido,
        }))[0]
        return {
            "unit": unit, "workshop": workshop, "professional": professional, "profile": profile,
        }
    except Exception:
        if auth_user:
            await delete_auth_user(auth_user["id"])
        if workshop:
            await db_delete("producao", "oficina_ortopedica", {"id": f"eq.{workshop['id']}"})
        if professional:
            await db_delete("fila", "profissional_saude", {"id": f"eq.{professional['id']}"})
        if unit:
            await db_delete("dominio", "estabelecimento_cnes", {"codigo_cnes": f"eq.{payload.codigo_cnes}"})
        raise


class SisregAuthorize(BaseModel):
    solicitacao_id: int = Field(ge=1)
    cre_destino_cnes: str
    produto_id: int | None = Field(default=None, ge=1)
    numero_autorizacao: str | None = None
    distancia_estimada_cre_km: float | None = Field(default=None, ge=0)
    observacao: str | None = None

    @field_validator("cre_destino_cnes", mode="before")
    @classmethod
    def validate_cre(cls, value: Any) -> str:
        result = normalize_code(value, field="CRE de destino", length=7)
        assert result is not None
        return result

    @field_validator("numero_autorizacao", mode="before")
    @classmethod
    def validate_authorization(cls, value: Any) -> str | None:
        return clean_text(value, field="Número de autorização SISREG", max_length=60)

    @field_validator("observacao", mode="before")
    @classmethod
    def validate_note(cls, value: Any) -> str | None:
        return clean_text(value, field="Observação", max_length=1000)


@app.post("/api/admin/sisreg/authorize", status_code=200)
async def authorize_sisreg(payload: SisregAuthorize, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "GESTOR")
    request_rows = await db_select("fila", "solicitacao_ortese", select="id,paciente_id,status,procedimento_sigtap,produto_id", filters={"id": f"eq.{payload.solicitacao_id}"}, limit=1)
    if not request_rows:
        raise HTTPException(status_code=404, detail="A solicitação selecionada não existe.")
    request_row = request_rows[0]
    if request_row.get("status") != "AGUARDANDO_AUTORIZACAO":
        raise HTTPException(status_code=409, detail="Esta solicitação já foi processada pelo SISREG ou não está aguardando autorização.")
    workshops = await db_select("producao", "oficina_ortopedica", select="id,cnes,nome,ativo", filters={"cnes": f"eq.{payload.cre_destino_cnes}", "ativo": "eq.true"}, limit=1)
    if not workshops:
        raise HTTPException(status_code=422, detail="O CRE selecionado não possui oficina ortopédica ativa.")
    await ensure_record_exists("dominio", "estabelecimento_cnes", "codigo_cnes", payload.cre_destino_cnes, "O CRE selecionado não existe ou está inativo.", extra_filters={"ativo": "eq.true"})
    selected_product_id = payload.produto_id or request_row.get("produto_id")
    if not selected_product_id:
        raise HTTPException(status_code=422, detail="Associe um produto OPM à solicitação antes de concluir a autorização SISREG.")
    selected_products = await db_select(
        "producao", "produto_ortese",
        select="id,procedimento_sigtap,nome_produto,ativo",
        filters={"id": f"eq.{selected_product_id}", "ativo": "eq.true"}, limit=1,
    )
    if not selected_products:
        raise HTTPException(status_code=422, detail="O produto OPM selecionado não existe ou está inativo.")
    if str(selected_products[0].get("procedimento_sigtap") or "").strip() != str(request_row.get("procedimento_sigtap") or "").strip():
        raise HTTPException(status_code=422, detail="O produto selecionado não corresponde ao procedimento da solicitação.")

    authorization = payload.numero_autorizacao or f"SISREG-DEMO-{payload.solicitacao_id}-{datetime.now().strftime('%Y%m%d')}"
    rpc_rows = await db_rpc("fila", "fn_autorizar_sisreg", {
        "p_solicitacao_id": payload.solicitacao_id,
        "p_cre_destino_cnes": payload.cre_destino_cnes,
        "p_produto_id": selected_product_id,
        "p_numero_autorizacao": authorization,
        "p_distancia_estimada_cre_km": payload.distancia_estimada_cre_km,
        "p_observacao": payload.observacao,
        "p_usuario_responsavel": "SISREG (simulação)",
    })
    if not rpc_rows:
        raise HTTPException(status_code=502, detail="O SISREG não retornou a solicitação autorizada.")
    updated = rpc_rows[0]

    profiles = await db_select("app", "usuario_sistema", select="auth_user_id", filters={"paciente_id": f"eq.{request_row['paciente_id']}", "papel": "eq.PACIENTE", "ativo": "eq.true"}, limit=1)
    if profiles:
        await db_insert("app", "notificacao", {
            "auth_user_id": profiles[0]["auth_user_id"],
            "tipo": "INFO",
            "titulo": "Solicitação autorizada pelo SISREG",
            "mensagem": f"Sua solicitação foi autorizada e vinculada ao CRE {workshops[0].get('nome') or payload.cre_destino_cnes}. A etapa de triagem já pode ser iniciada.",
            "referencia_tabela": "fila.solicitacao_ortese",
            "referencia_id": payload.solicitacao_id,
            "destino_ui": "patient_orders",
        })
    try:
        await _run_matching_and_notify()
    except HTTPException:
        # A autorização SISREG já foi persistida; matching é uma etapa secundária e
        # não pode transformar sucesso do fluxo principal em erro para o usuário.
        pass
    return {"request": updated, "authorization": authorization, "cre": workshops[0], "product": selected_products[0]}


class OngPartnerCreate(BaseModel):
    oficina_id: int | None = Field(default=None, ge=1)
    nome_ong: str
    cnpj: str | None = None
    tipo_parceria: str
    responsavel_contato: str | None = None
    email: EmailStr | None = None
    telefone: str | None = None
    data_inicio: date | None = None
    data_fim: date | None = None
    observacoes: str | None = None

    @field_validator("nome_ong", "tipo_parceria", mode="before")
    @classmethod
    def validate_required_text(cls, value: Any) -> str:
        result = clean_text(value, field="Parceria", required=True, max_length=255)
        assert result is not None
        return result

    @field_validator("cnpj", mode="before")
    @classmethod
    def validate_cnpj(cls, value: Any) -> str | None:
        return normalize_cnpj(value)

    @field_validator("telefone", mode="before")
    @classmethod
    def validate_phone(cls, value: Any) -> str | None:
        return normalize_phone(value)

    @field_validator("responsavel_contato", mode="before")
    @classmethod
    def validate_contact(cls, value: Any) -> str | None:
        return clean_text(value, field="Responsável de contato", max_length=255)

    @field_validator("observacoes", mode="before")
    @classmethod
    def validate_notes(cls, value: Any) -> str | None:
        return clean_text(value, field="Observações", max_length=2000)

    @model_validator(mode="after")
    def validate_period(self) -> "OngPartnerCreate":
        validate_date_range(self.data_inicio, self.data_fim, label="parceria")
        return self


@app.post("/api/admin/partners/ongs", status_code=201)
async def create_ong_partner(payload: OngPartnerCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "GESTOR")
    if payload.oficina_id is not None:
        await ensure_record_exists("producao", "oficina_ortopedica", "id", payload.oficina_id, "O CRE selecionado não possui oficina ativa.", extra_filters={"ativo": "eq.true"})
    if payload.cnpj:
        office_filter = f"eq.{payload.oficina_id}" if payload.oficina_id is not None else "is.null"
        existing = await db_select("app", "parceria_ong", select="id", filters={"oficina_id": office_filter, "cnpj": f"eq.{payload.cnpj}"}, limit=1)
        if existing:
            detail = "Esta ONG já está vinculada a este CRE." if payload.oficina_id is not None else "Esta ONG já está cadastrada sem CRE parceiro."
            raise HTTPException(status_code=409, detail=detail)
    rows = await db_insert("app", "parceria_ong", {
        "oficina_id": payload.oficina_id,
        "nome_ong": payload.nome_ong,
        "cnpj": payload.cnpj or None,
        "tipo_parceria": payload.tipo_parceria,
        "responsavel_contato": payload.responsavel_contato or None,
        "email": payload.email or None,
        "telefone": payload.telefone or None,
        "data_inicio": payload.data_inicio.isoformat() if payload.data_inicio else None,
        "data_fim": payload.data_fim.isoformat() if payload.data_fim else None,
        "observacoes": payload.observacoes or None,
        "ativa": True,
    })
    return rows[0]


class TriageCreate(BaseModel):
    paciente_id: int = Field(ge=1)
    procedimento_sigtap_proposto: str | None = None
    status: Literal["PENDENTE"] = "PENDENTE"
    observacao_clinica: str | None = None

    @field_validator("procedimento_sigtap_proposto", mode="before")
    @classmethod
    def validate_procedure(cls, value: Any) -> str | None:
        return normalize_sigtap(value, required=False, opm_only=True)

    @field_validator("observacao_clinica", mode="before")
    @classmethod
    def validate_notes(cls, value: Any) -> str | None:
        return clean_text(value, field="Observação clínica")


@app.post("/api/cre/triages", status_code=201)
async def create_triage(payload: TriageCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE")
    if not identity.profissional_saude_id:
        raise HTTPException(status_code=422, detail="O usuário não está vinculado a um profissional de saúde.")
    if not identity.cnes_vinculo:
        raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
    request_filters: dict[str, Any] = {
        "paciente_id": f"eq.{payload.paciente_id}",
        "cre_destino_cnes": f"eq.{str(identity.cnes_vinculo).strip()}",
    }
    active_requests = await db_select(
        "fila",
        "solicitacao_ortese",
        select="id,procedimento_sigtap,status,data_solicitacao,cre_destino_cnes",
        filters=request_filters,
        order="data_solicitacao.desc",
        limit=50,
    )
    current_request = next((row for row in active_requests if row.get("status") in {"AUTORIZADA", "EM_FILA"}), None)
    if not current_request:
        raise HTTPException(
            status_code=404,
            detail="Paciente ou solicitação autorizada não encontrada para este CRE.",
        )
    existing_triages = await db_select(
        "fila", "triagem_clinica",
        select="id,status",
        filters={
            "solicitacao_id": f"eq.{current_request['id']}",
            "status": "in.(PENDENTE,EM_ANDAMENTO)",
        },
        order="data_hora.desc",
        limit=1,
    )
    if existing_triages:
        raise HTTPException(status_code=409, detail="Esta solicitação já possui uma triagem ativa.")
    procedure = payload.procedimento_sigtap_proposto or current_request.get("procedimento_sigtap")
    if procedure:
        await ensure_record_exists(
            "dominio",
            "sigtap_procedimento",
            "codigo",
            procedure,
            "O procedimento SIGTAP informado não existe ou está inativo.",
            extra_filters={"ativo": "eq.true"},
        )
    rows = await db_insert("fila", "triagem_clinica", {
        "paciente_id": payload.paciente_id,
        "profissional_id": identity.profissional_saude_id,
        "solicitacao_id": current_request["id"],
        "procedimento_sigtap_proposto": procedure or None,
        "status": "PENDENTE",
        "observacao_clinica": payload.observacao_clinica or None,
    })
    await db_update(
        "fila", "fila_espera",
        {"solicitacao_id": f"eq.{current_request['id']}"},
        {"data_convocacao": datetime.now().isoformat()},
    )
    await _notify_patient_workflow(
        payload.paciente_id,
        "Triagem registrada pelo CRE",
        "Sua triagem foi registrada e está pendente. A equipe do CRE dará continuidade ao atendimento pela ordem das etapas.",
        int(current_request["id"]),
    )
    return rows[0]


class RequestCreate(BaseModel):
    paciente_id: int = Field(ge=1)
    procedimento_sigtap: str
    cid10_codigo: str
    justificativa_clinica: str
    lado_acometido: Literal["DIREITO", "ESQUERDO", "BILATERAL", "NAO_APLICAVEL"] | None = None
    prioridade_clinica: Literal["ROTINA", "PRIORITARIO", "URGENTE"] = "ROTINA"
    distancia_estimada_cre_km: float | None = Field(default=None, ge=0)

    @field_validator("procedimento_sigtap", mode="before")
    @classmethod
    def validate_procedure(cls, value: Any) -> str:
        result = normalize_sigtap(value, opm_only=True)
        assert result is not None
        return result

    @field_validator("cid10_codigo", mode="before")
    @classmethod
    def validate_diagnosis(cls, value: Any) -> str:
        return normalize_cid10(value)

    @field_validator("justificativa_clinica", mode="before")
    @classmethod
    def validate_justification(cls, value: Any) -> str:
        result = clean_text(value, field="Justificativa clínica", required=True)
        assert result is not None
        return result


@app.post("/api/cre/requests", status_code=201)
async def create_request(payload: RequestCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE", "GESTOR")
    raise HTTPException(
        status_code=409,
        detail="O CRE não cria solicitações diretamente. Cadastre o paciente pela origem assistencial e faça o encaminhamento pelo fluxo SISREG.",
    )


class TriagePatch(BaseModel):
    status: Literal["PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "CANCELADA"] | None = None
    workflow_status: Literal[
        "PENDENTE", "EM_ANDAMENTO", "CONCLUIDA", "EM_PRODUCAO",
        "PRONTA_PARA_ENTREGA", "ENTREGUE", "CANCELADA"
    ] | None = None
    motivo_cancelamento: str | None = Field(default=None, max_length=1000)
    observacao_clinica: str | None = None
    procedimento_sigtap_proposto: str | None = None

    @field_validator("procedimento_sigtap_proposto", mode="before")
    @classmethod
    def validate_procedure(cls, value: Any) -> str | None:
        return normalize_sigtap(value, required=False, opm_only=True)

    @field_validator("observacao_clinica", "motivo_cancelamento", mode="before")
    @classmethod
    def validate_notes(cls, value: Any) -> str | None:
        return clean_text(value, field="Observação", required=False, max_length=1000)


TRIAGE_WORKFLOW_SEQUENCE = (
    "PENDENTE",
    "EM_ANDAMENTO",
    "CONCLUIDA",
    "EM_PRODUCAO",
    "PRONTA_PARA_ENTREGA",
    "ENTREGUE",
)

WORKFLOW_PATIENT_MESSAGES: dict[str, tuple[str, str]] = {
    "EM_ANDAMENTO": (
        "Triagem iniciada",
        "Sua triagem no CRE está em andamento. A equipe iniciou a avaliação clínica do seu atendimento.",
    ),
    "CONCLUIDA": (
        "Triagem concluída",
        "Sua triagem clínica foi concluída. A próxima etapa do atendimento é o início da produção do dispositivo.",
    ),
    "EM_PRODUCAO": (
        "Dispositivo em produção",
        "O CRE iniciou a produção do seu dispositivo. Você será avisado quando ele estiver pronto para retirada.",
    ),
    "PRONTA_PARA_ENTREGA": (
        "Dispositivo pronto para entrega",
        "Seu dispositivo está pronto e aguarda recolhimento no CRE responsável.",
    ),
    "ENTREGUE": (
        "Dispositivo entregue",
        "A entrega do seu dispositivo foi registrada pelo CRE.",
    ),
}


def _triage_workflow_status(triage_status: str, request_status: str, production_status: str | None) -> str:
    if triage_status == "CANCELADA" or request_status == "CANCELADA" or production_status == "CANCELADA":
        return "CANCELADA"
    if request_status == "ENTREGUE" or production_status == "ENTREGUE":
        return "ENTREGUE"
    if request_status == "PRONTA_PARA_ENTREGA" or production_status == "PRONTA_PARA_ENTREGA":
        return "PRONTA_PARA_ENTREGA"
    if request_status == "EM_PRODUCAO" or production_status in {"AGUARDANDO_MEDIDAS", "EM_PRODUCAO", "CONTROLE_QUALIDADE"}:
        return "EM_PRODUCAO"
    if triage_status == "CONCLUIDA":
        return "CONCLUIDA"
    if triage_status == "EM_ANDAMENTO":
        return "EM_ANDAMENTO"
    return "PENDENTE"


def _validate_workflow_transition(current: str, target: str) -> None:
    if target == current:
        return
    if current in {"ENTREGUE", "CANCELADA"}:
        raise HTTPException(status_code=409, detail="Este atendimento já está encerrado e o status não pode mais ser alterado.")
    if target == "CANCELADA":
        return
    if current not in TRIAGE_WORKFLOW_SEQUENCE:
        raise HTTPException(status_code=409, detail="O status atual do atendimento é inválido para progressão automática.")
    current_index = TRIAGE_WORKFLOW_SEQUENCE.index(current)
    expected = TRIAGE_WORKFLOW_SEQUENCE[current_index + 1]
    if target != expected:
        raise HTTPException(
            status_code=409,
            detail=f"Transição inválida: o atendimento está em {current} e só pode avançar para {expected}. Não é permitido voltar ou pular etapas.",
        )


async def _active_matching_for_request(request_id: int) -> dict[str, Any] | None:
    rows = await db_select(
        "producao", "vw_matchings_cre",
        filters={"solicitacao_id": f"eq.{request_id}", "status": "in.(PROPOSTO,ACEITO,EM_TRANSITO)"},
        order="criado_em.desc", limit=1,
    )
    return rows[0] if rows else None


async def _production_order_for_request(
    request_row: dict[str, Any],
    cnes: str,
    professional_id: int | None,
) -> dict[str, Any]:
    existing = await db_select(
        "producao",
        "ordem_producao",
        select="id,solicitacao_id,oficina_id,produto_id,status,data_abertura,data_conclusao",
        filters={"solicitacao_id": f"eq.{request_row['id']}"},
        limit=1,
    )
    if existing:
        return existing[0]

    workshops = await db_select(
        "producao",
        "oficina_ortopedica",
        select="id,cnes,nome,ativo",
        filters={"cnes": f"eq.{cnes}", "ativo": "eq.true"},
        limit=1,
    )
    if not workshops:
        raise HTTPException(status_code=422, detail="Este CRE não possui oficina ortopédica ativa para iniciar a produção.")

    product_id = request_row.get("produto_id")
    if not product_id:
        raise HTTPException(status_code=409, detail="Esta solicitação ainda não possui um produto OPM associado. Faça a associação no Manager/SISREG antes de iniciar a produção.")
    products = await db_select(
        "producao", "produto_ortese",
        select="id,procedimento_sigtap,nome_produto,ativo",
        filters={"id": f"eq.{product_id}", "ativo": "eq.true"}, limit=1,
    )
    if not products or str(products[0].get("procedimento_sigtap") or "").strip() != str(request_row.get("procedimento_sigtap") or "").strip():
        raise HTTPException(status_code=409, detail="O produto associado à solicitação está inativo ou incompatível com o procedimento.")
    active_match = await _active_matching_for_request(int(request_row["id"]))
    if active_match and active_match.get("status") == "PROPOSTO":
        raise HTTPException(status_code=409, detail="Existe um matching de reaproveitamento aguardando aceite do CRE de origem. Resolva o matching antes de iniciar a etapa operacional.")

    created = await db_insert("producao", "ordem_producao", {
        "solicitacao_id": request_row["id"],
        "oficina_id": workshops[0]["id"],
        "produto_id": products[0]["id"],
        "tecnico_responsavel_id": professional_id,
        "status": "AGUARDANDO_MEDIDAS",
        "origem_atendimento": "REAPROVEITAMENTO" if active_match and active_match.get("status") in {"ACEITO", "EM_TRANSITO"} else "FABRICACAO",
        "observacoes_tecnicas": (
            f"Atendimento por reaproveitamento nacional. Matching #{active_match['matching_id']} — "
            f"peça {active_match.get('numero_serie') or 'sem série informada'} transferida do CRE "
            f"{active_match.get('cre_origem_cnes')}. Sem nova fabricação."
            if active_match and active_match.get("status") in {"ACEITO", "EM_TRANSITO"}
            else None
        ),
    })
    return created[0]


async def _notify_patient_workflow(patient_id: int, title: str, message: str, request_id: int, urgent: bool = False) -> None:
    profiles = await db_select(
        "app",
        "usuario_sistema",
        select="auth_user_id",
        filters={"paciente_id": f"eq.{patient_id}", "papel": "eq.PACIENTE", "ativo": "eq.true"},
        limit=5,
    )
    if not profiles:
        return
    await db_insert("app", "notificacao", [
        {
            "auth_user_id": profile["auth_user_id"],
            "tipo": "URGENTE" if urgent else "INFO",
            "titulo": title,
            "mensagem": message,
            "referencia_tabela": "fila.solicitacao_ortese",
            "referencia_id": request_id,
            "destino_ui": "patient_orders",
        }
        for profile in profiles
    ])


@app.patch("/api/cre/triages/{triage_id}")
async def update_triage(triage_id: int, payload: TriagePatch, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE")
    if not identity.cnes_vinculo:
        raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
    cnes = str(identity.cnes_vinculo).strip()

    triage_rows = await db_select(
        "fila",
        "vw_triagens",
        select="triagem_id,paciente_id,solicitacao_id,cre_destino_cnes,status,observacao_clinica,procedimento_sigtap_proposto",
        filters={"triagem_id": f"eq.{triage_id}", "cre_destino_cnes": f"eq.{cnes}"},
        limit=1,
    )
    if not triage_rows:
        raise HTTPException(status_code=404, detail="Triagem não encontrada para este CRE.")
    triage = triage_rows[0]
    request_id = triage.get("solicitacao_id")
    if not request_id:
        raise HTTPException(status_code=409, detail="Esta triagem não está vinculada a uma solicitação do SISREG.")

    request_rows = await db_select(
        "fila",
        "solicitacao_ortese",
        select="id,paciente_id,procedimento_sigtap,produto_id,status,cre_destino_cnes",
        filters={"id": f"eq.{request_id}", "cre_destino_cnes": f"eq.{cnes}"},
        limit=1,
    )
    if not request_rows:
        raise HTTPException(status_code=404, detail="Solicitação vinculada à triagem não encontrada para este CRE.")
    request_row = request_rows[0]
    request_cnes = cnes

    if payload.procedimento_sigtap_proposto:
        await ensure_record_exists(
            "dominio", "sigtap_procedimento", "codigo", payload.procedimento_sigtap_proposto,
            "O procedimento SIGTAP informado não existe ou está inativo.", extra_filters={"ativo": "eq.true"},
        )

    requested_workflow = payload.workflow_status or payload.status
    if not requested_workflow and payload.observacao_clinica is None and payload.procedimento_sigtap_proposto is None:
        raise HTTPException(status_code=422, detail="Informe ao menos uma alteração para a triagem.")

    order_rows = await db_select(
        "producao", "ordem_producao",
        select="id,solicitacao_id,status,data_abertura,data_conclusao",
        filters={"solicitacao_id": f"eq.{request_id}"}, limit=1,
    )
    existing_order = order_rows[0] if order_rows else None
    active_matching = await _active_matching_for_request(int(request_id))
    previous_workflow = _triage_workflow_status(
        str(triage.get("status") or "PENDENTE"),
        str(request_row.get("status") or "EM_FILA"),
        str(existing_order.get("status")) if existing_order else None,
    )
    workflow = str(requested_workflow) if requested_workflow else previous_workflow
    _validate_workflow_transition(previous_workflow, workflow)

    triage_changes: dict[str, Any] = {}
    if payload.observacao_clinica is not None:
        triage_changes["observacao_clinica"] = payload.observacao_clinica
    if payload.procedimento_sigtap_proposto is not None:
        triage_changes["procedimento_sigtap_proposto"] = payload.procedimento_sigtap_proposto

    patient_notification: tuple[str, str, bool] | None = None
    state_changed = workflow != previous_workflow

    if state_changed and workflow == "CANCELADA":
        reason = (payload.motivo_cancelamento or "").strip()
        if len(reason) < 5:
            raise HTTPException(status_code=422, detail="Informe uma justificativa clara para cancelar o atendimento.")
        triage_changes["status"] = "CANCELADA"
        previous_request_status = str(request_row.get("status") or "EM_FILA")
        await db_update("fila", "solicitacao_ortese", {"id": f"eq.{request_id}", "cre_destino_cnes": f"eq.{cnes}"}, {
            "status": "CANCELADA",
            "motivo_cancelamento": reason,
            "data_ultima_atualizacao": datetime.now().isoformat(),
        })
        if existing_order:
            await db_update("producao", "ordem_producao", {"id": f"eq.{existing_order['id']}"}, {"status": "CANCELADA"})
        if active_matching:
            prior_match_status = str(active_matching.get("status") or "")
            await db_update("producao", "matching_dispositivo", {"id": f"eq.{active_matching['matching_id']}"}, {
                "status": "CANCELADO", "atualizado_em": datetime.now().isoformat(),
            })
            await db_update("producao", "estoque_dispositivo", {"id": f"eq.{active_matching['estoque_dispositivo_id']}"}, {
                "status": "BLOQUEADO" if prior_match_status == "EM_TRANSITO" else "DISPONIVEL",
                "atualizado_em": datetime.now().isoformat(),
            })
        await db_update("fila", "fila_espera", {"solicitacao_id": f"eq.{request_id}"}, {
            "data_saida_fila": datetime.now().isoformat(),
            "motivo_saida": "OUTRO",
        })
        await db_insert("fila", "historico_status_solicitacao", {
            "solicitacao_id": request_id,
            "status_anterior": previous_request_status,
            "status_novo": "CANCELADA",
            "usuario_responsavel": identity.auth_user_id,
            "observacao": reason,
        })
        patient_notification = ("Atendimento cancelado", f"O CRE cancelou esta solicitação. Motivo: {reason}", True)

    elif state_changed and workflow in {"EM_ANDAMENTO", "CONCLUIDA"}:
        triage_changes["status"] = workflow
        title, message = WORKFLOW_PATIENT_MESSAGES[workflow]
        patient_notification = (title, message, False)

    elif state_changed and workflow in {"EM_PRODUCAO", "PRONTA_PARA_ENTREGA", "ENTREGUE"}:
        if not request_cnes:
            raise HTTPException(status_code=409, detail="A solicitação ainda não possui CRE de destino.")
        order = await _production_order_for_request(request_row, request_cnes, identity.profissional_saude_id)
        active_matching = await _active_matching_for_request(int(request_id))
        triage_changes["status"] = "CONCLUIDA"

        if workflow == "EM_PRODUCAO":
            await db_update("producao", "ordem_producao", {"id": f"eq.{order['id']}"}, {
                "status": "EM_PRODUCAO",
                "data_conclusao": None,
            })
            await db_update("fila", "solicitacao_ortese", {"id": f"eq.{request_id}"}, {
                "status": "EM_PRODUCAO",
                "data_ultima_atualizacao": datetime.now().isoformat(),
            })
            if active_matching and active_matching.get("status") == "ACEITO":
                await db_update("producao", "matching_dispositivo", {"id": f"eq.{active_matching['matching_id']}"}, {
                    "status": "EM_TRANSITO", "atualizado_em": datetime.now().isoformat(),
                })
                await db_update("producao", "estoque_dispositivo", {"id": f"eq.{active_matching['estoque_dispositivo_id']}"}, {
                    "status": "EM_TRANSFERENCIA", "atualizado_em": datetime.now().isoformat(),
                })
            await db_insert("fila", "historico_status_solicitacao", {
                "solicitacao_id": request_id,
                "status_anterior": request_row.get("status"),
                "status_novo": "EM_PRODUCAO",
                "usuario_responsavel": identity.auth_user_id,
                "observacao": "Transferência do dispositivo reaproveitado iniciada." if active_matching else "Produção iniciada pelo CRE.",
            })
            await db_update("fila", "fila_espera", {"solicitacao_id": f"eq.{request_id}"}, {
                "data_saida_fila": datetime.now().isoformat(),
                "motivo_saida": "ENCAMINHADO_PRODUCAO",
            })
        elif workflow == "PRONTA_PARA_ENTREGA":
            await db_update("producao", "ordem_producao", {"id": f"eq.{order['id']}"}, {
                "status": "PRONTA_PARA_ENTREGA",
                "data_conclusao": datetime.now().isoformat(),
            })
            await db_update("fila", "solicitacao_ortese", {"id": f"eq.{request_id}", "cre_destino_cnes": f"eq.{cnes}"}, {
                "status": "PRONTA_PARA_ENTREGA",
                "data_ultima_atualizacao": datetime.now().isoformat(),
            })
            if active_matching and active_matching.get("status") in {"ACEITO", "EM_TRANSITO"}:
                await db_update("producao", "matching_dispositivo", {"id": f"eq.{active_matching['matching_id']}"}, {
                    "status": "CONCLUIDO", "atualizado_em": datetime.now().isoformat(),
                })
                await db_update("producao", "estoque_dispositivo", {"id": f"eq.{active_matching['estoque_dispositivo_id']}"}, {
                    "status": "UTILIZADO", "atualizado_em": datetime.now().isoformat(),
                })
            await db_insert("fila", "historico_status_solicitacao", {
                "solicitacao_id": request_id,
                "status_anterior": "EM_PRODUCAO",
                "status_novo": "PRONTA_PARA_ENTREGA",
                "usuario_responsavel": identity.auth_user_id,
                "observacao": "Dispositivo pronto e aguardando recolhimento no CRE.",
            })
        elif workflow == "ENTREGUE":
            await db_update("producao", "ordem_producao", {"id": f"eq.{order['id']}"}, {
                "status": "ENTREGUE",
                "data_conclusao": datetime.now().isoformat(),
            })
            await db_update("fila", "solicitacao_ortese", {"id": f"eq.{request_id}"}, {
                "status": "ENTREGUE",
                "data_ultima_atualizacao": datetime.now().isoformat(),
            })
            deliveries = await db_select(
                "producao", "entrega_ortese", select="id",
                filters={"ordem_producao_id": f"eq.{order['id']}"}, limit=1,
            )
            if not deliveries:
                await db_insert("producao", "entrega_ortese", {
                    "ordem_producao_id": order["id"],
                    "profissional_entrega_id": identity.profissional_saude_id,
                    "orientacoes_fornecidas": "Entrega registrada pelo portal do CRE.",
                })
            await db_insert("fila", "historico_status_solicitacao", {
                "solicitacao_id": request_id,
                "status_anterior": "PRONTA_PARA_ENTREGA",
                "status_novo": "ENTREGUE",
                "usuario_responsavel": identity.auth_user_id,
                "observacao": "Dispositivo entregue ao paciente.",
            })
        title, message = WORKFLOW_PATIENT_MESSAGES[workflow]
        if active_matching and workflow == "EM_PRODUCAO":
            title = "Dispositivo em transferência"
            message = "Um dispositivo compatível foi reaproveitado por matching nacional e está sendo transferido para o seu CRE."
        elif active_matching and workflow == "PRONTA_PARA_ENTREGA":
            title = "Dispositivo recebido pelo CRE"
            message = "O dispositivo reaproveitado chegou ao seu CRE e está pronto para a etapa de entrega."
        patient_notification = (title, message, False)

    if triage_changes:
        rows = await db_update(
            "fila", "triagem_clinica",
            {"id": f"eq.{triage_id}", "solicitacao_id": f"eq.{request_id}"},
            triage_changes,
        )
        if not rows:
            raise HTTPException(status_code=404, detail="Triagem não encontrada.")
    else:
        rows = triage_rows

    if patient_notification:
        title, message, urgent = patient_notification
        await _notify_patient_workflow(
            int(request_row["paciente_id"]), title, message, int(request_id), urgent=urgent,
        )

    current_order = await db_select(
        "producao", "ordem_producao", select="id,status",
        filters={"solicitacao_id": f"eq.{request_id}"}, limit=1,
    )
    current_request = await db_select(
        "fila", "solicitacao_ortese", select="id,status",
        filters={"id": f"eq.{request_id}"}, limit=1,
    )
    result = rows[0]
    result["workflow_status"] = _triage_workflow_status(
        str(result.get("status") or triage.get("status") or "PENDENTE"),
        str(current_request[0].get("status") if current_request else request_row.get("status") or "EM_FILA"),
        str(current_order[0].get("status")) if current_order else None,
    )
    result["solicitacao_id"] = request_id
    result["paciente_id"] = triage.get("paciente_id")
    return result


class ShipmentCreate(BaseModel):
    tipo_dispositivo: str
    quantidade: int = Field(default=1, ge=1, le=10000)
    fabricante_destino: str
    endereco_destino: str | None = None
    codigo_rastreio: str | None = None
    status: Literal["AGUARDANDO_COLETA", "EM_TRANSITO", "ENTREGUE"] = "AGUARDANDO_COLETA"

    @field_validator("tipo_dispositivo", "fabricante_destino", mode="before")
    @classmethod
    def validate_required_text(cls, value: Any, info: Any) -> str:
        label = "Tipo de dispositivo" if info.field_name == "tipo_dispositivo" else "Fabricante de destino"
        result = clean_text(value, field=label, required=True, max_length=255)
        assert result is not None
        return result

    @field_validator("endereco_destino", "codigo_rastreio", mode="before")
    @classmethod
    def validate_optional_text(cls, value: Any, info: Any) -> str | None:
        label = "Endereço de destino" if info.field_name == "endereco_destino" else "Código de rastreio"
        return clean_text(value, field=label, required=False, max_length=255)


@app.post("/api/cre/shipments", status_code=201)
async def create_shipment(payload: ShipmentCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE")
    if not identity.cnes_vinculo:
        raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
    workshop_filters = {"ativo": "eq.true", "cnes": f"eq.{identity.cnes_vinculo}"}
    workshops = await db_select("producao", "oficina_ortopedica", select="id,cnes,nome", filters=workshop_filters, limit=1)
    if not workshops:
        raise HTTPException(status_code=422, detail="O usuário não está vinculado a uma oficina ortopédica ativa.")
    rows = await db_insert("producao", "remessa_logistica_reversa", {
        "oficina_id": workshops[0]["id"],
        "tipo_dispositivo": payload.tipo_dispositivo,
        "quantidade": payload.quantidade,
        "fabricante_destino": payload.fabricante_destino,
        "endereco_destino": payload.endereco_destino,
        "codigo_rastreio": payload.codigo_rastreio,
        "status": payload.status,
    })
    return rows[0]


class AlertCreate(BaseModel):
    titulo: str
    mensagem: str
    tipo: Literal["INFO", "ALERTA", "LEMBRETE", "URGENTE"] = "ALERTA"
    audiencia: Literal["ALL", "PACIENTES", "FISCAL_CRE", "GESTORES", "UNIT_PATIENTS", "UNIT_STAFF"]
    target: str = "communications"

    @field_validator("titulo", mode="before")
    @classmethod
    def validate_title(cls, value: Any) -> str:
        result = clean_text(value, field="Título", required=True, max_length=255)
        assert result is not None
        return result

    @field_validator("mensagem", mode="before")
    @classmethod
    def validate_message(cls, value: Any) -> str:
        result = clean_text(value, field="Mensagem", required=True, max_length=500)
        assert result is not None
        return result

    @field_validator("target", mode="before")
    @classmethod
    def validate_target(cls, value: Any) -> str:
        target = clean_text(value, field="Destino", required=True, max_length=50)
        assert target is not None
        allowed = {
            "communications", "manager_lifecycle", "manager_logistics", "manager_reports", "manager_centers",
            "manager_finance", "manager_equity", "manager_registrations", "cre_patients", "cre_logistics",
            "cre_triages", "cre_reports", "cre_support", "cre_matching", "patient_orders", "patient_notifications", "patient_support",
        }
        if target not in allowed:
            raise ValueError("Destino de interface inválido.")
        return target


class RecallCreate(BaseModel):
    codigo_lote: str
    nome_produto: str
    motivo: str
    data_limite: date | None = None
    affected_devices: int = Field(default=0, ge=0)
    status: Literal["ABERTO", "EM_ANDAMENTO", "ENCERRADO", "CANCELADO"] = "ABERTO"
    orgao_notificador: str | None = None

    @field_validator("codigo_lote", mode="before")
    @classmethod
    def validate_batch(cls, value: Any) -> str:
        result = clean_text(value, field="Código do lote", required=True, max_length=100)
        assert result is not None
        return result

    @field_validator("nome_produto", mode="before")
    @classmethod
    def validate_product(cls, value: Any) -> str:
        result = clean_text(value, field="Nome do produto", required=True, max_length=255)
        assert result is not None
        return result

    @field_validator("motivo", mode="before")
    @classmethod
    def validate_reason(cls, value: Any) -> str:
        result = clean_text(value, field="Motivo", required=True, max_length=1000)
        assert result is not None
        return result

    @field_validator("orgao_notificador", mode="before")
    @classmethod
    def validate_issuer(cls, value: Any) -> str | None:
        return clean_text(value, field="Órgão notificador", required=False, max_length=100)


def _notification_target_for_role(target: str, role: str) -> str:
    if target == "communications":
        return "patient_notifications" if role == "PACIENTE" else "communications"
    if role == "PACIENTE" and target.startswith(("manager_", "cre_")):
        return "patient_notifications"
    if role == "FISCAL_CRE" and target.startswith("manager_"):
        mapping = {"manager_lifecycle": "cre_logistics", "manager_logistics": "cre_logistics", "manager_reports": "cre_reports", "manager_centers": "cre_logistics"}
        return mapping.get(target, "communications")
    if role == "GESTOR" and target.startswith("cre_"):
        mapping = {"cre_logistics": "manager_logistics", "cre_reports": "manager_reports", "cre_patients": "manager_registrations", "cre_triages": "manager_reports"}
        return mapping.get(target, "communications")
    return target


async def _alert_recipients(payload: AlertCreate, identity: Identity) -> list[dict[str, Any]]:
    users = await db_select("app", "usuario_sistema", select="auth_user_id,papel,paciente_id,cnes_vinculo", filters={"ativo": "eq.true"}, limit=5000)
    if identity.papel == "FISCAL_CRE":
        if payload.audiencia not in {"UNIT_PATIENTS", "UNIT_STAFF"}:
            raise HTTPException(status_code=403, detail="O CRE só pode emitir alertas para pacientes ou equipe da própria unidade.")
        if not identity.cnes_vinculo:
            raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
        if payload.audiencia == "UNIT_STAFF":
            return [user for user in users if user.get("cnes_vinculo") == identity.cnes_vinculo and user.get("papel") == "FISCAL_CRE"]
        linked_patients = await db_select(
            "fila",
            "vw_pacientes_cre",
            select="paciente_id",
            filters={"cre_destino_cnes": f"eq.{str(identity.cnes_vinculo).strip()}"},
            limit=5000,
        )
        patient_ids = {row.get("paciente_id") for row in linked_patients if row.get("paciente_id") is not None}
        return [user for user in users if user.get("papel") == "PACIENTE" and user.get("paciente_id") in patient_ids]

    require_roles(identity, "GESTOR")
    if payload.audiencia == "ALL":
        return users
    role_map = {"PACIENTES": "PACIENTE", "FISCAL_CRE": "FISCAL_CRE", "GESTORES": "GESTOR"}
    wanted = role_map.get(payload.audiencia)
    if not wanted:
        raise HTTPException(status_code=422, detail="Audiência inválida para o gestor.")
    return [user for user in users if user.get("papel") == wanted]


@app.post("/api/communications/alerts", status_code=201)
async def create_alert(payload: AlertCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE", "GESTOR")
    recipients = await _alert_recipients(payload, identity)
    if not recipients:
        raise HTTPException(status_code=422, detail="Nenhum usuário corresponde à audiência selecionada.")
    rows = [{
        "auth_user_id": recipient["auth_user_id"],
        "tipo": payload.tipo,
        "titulo": payload.titulo,
        "mensagem": payload.mensagem,
        "destino_ui": _notification_target_for_role(payload.target, str(recipient.get("papel"))),
        "referencia_tabela": "app.notificacao",
    } for recipient in recipients]
    await db_insert("app", "notificacao", rows)
    return {"ok": True, "recipients": len(rows)}


@app.get("/api/communications/recalls")
async def communications_recalls(identity: Identity = Depends(current_identity)) -> list[dict[str, Any]]:
    require_roles(identity, "FISCAL_CRE", "GESTOR")
    if identity.papel == "FISCAL_CRE":
        return await cre_recalls(identity)
    return await db_select("app", "recall", order="data_abertura.desc", limit=100)


@app.post("/api/communications/recalls", status_code=201)
async def create_recall(payload: RecallCreate, identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "FISCAL_CRE", "GESTOR")
    affected_devices = payload.affected_devices
    issuer = payload.orgao_notificador or "UMDR"

    if identity.papel == "FISCAL_CRE":
        if not identity.cnes_vinculo:
            raise HTTPException(status_code=422, detail="O usuário CRE não possui CNES vinculado.")
        cnes = str(identity.cnes_vinculo).strip()
        local_lots, _ = await _cre_local_lots(cnes)
        if payload.codigo_lote.strip() not in local_lots:
            raise HTTPException(status_code=404, detail="Lote não encontrado no estoque deste CRE.")

        offices = await db_select(
            "producao", "oficina_ortopedica", select="id",
            filters={"cnes": f"eq.{cnes}", "ativo": "eq.true"}, limit=20,
        )
        office_ids = [int(row["id"]) for row in offices if row.get("id") is not None]
        physical = await db_select(
            "producao", "estoque_dispositivo", select="id",
            filters={
                "oficina_id": f"in.({','.join(map(str, office_ids))})",
                "lote_fabricante": f"eq.{payload.codigo_lote.strip()}",
            },
            limit=5000,
        ) if office_ids else []
        affected_devices = len(physical)
        issuer = cnes

    rows = await db_insert("app", "recall", {
        "codigo_lote": payload.codigo_lote,
        "nome_produto": payload.nome_produto,
        "motivo": payload.motivo,
        "data_limite": payload.data_limite.isoformat() if payload.data_limite else None,
        "affected_devices": affected_devices,
        "status": payload.status,
        "orgao_notificador": issuer,
    })
    return rows[0]


# -----------------------------------------------------------------------------
# Painel gestor. A agregação é feita aqui para o banco continuar simples.
# -----------------------------------------------------------------------------

ACCESS_MATRIX: list[dict[str, str]] = [
    {"key": "identity", "PACIENTE": "OWN_READ", "FISCAL_CRE": "UNIT_READ", "GESTOR": "NATIONAL_MANAGE"},
    {"key": "requests", "PACIENTE": "OWN_READ", "FISCAL_CRE": "UNIT_MANAGE", "GESTOR": "NATIONAL_MANAGE"},
    {"key": "clinical", "PACIENTE": "OWN_READ", "FISCAL_CRE": "UNIT_MANAGE", "GESTOR": "NATIONAL_READ"},
    {"key": "production", "PACIENTE": "OWN_READ", "FISCAL_CRE": "UNIT_MANAGE", "GESTOR": "NATIONAL_MANAGE"},
    {"key": "inventory", "PACIENTE": "NONE", "FISCAL_CRE": "UNIT_MANAGE", "GESTOR": "NATIONAL_MANAGE"},
    {"key": "logistics", "PACIENTE": "OWN_READ", "FISCAL_CRE": "UNIT_MANAGE", "GESTOR": "NATIONAL_MANAGE"},
    {"key": "finance", "PACIENTE": "NONE", "FISCAL_CRE": "UNIT_READ", "GESTOR": "NATIONAL_MANAGE"},
    {"key": "reports", "PACIENTE": "NONE", "FISCAL_CRE": "UNIT_READ", "GESTOR": "NATIONAL_MANAGE"},
    {"key": "users", "PACIENTE": "NONE", "FISCAL_CRE": "NONE", "GESTOR": "NATIONAL_MANAGE"},
]


@app.get("/api/manager/access-matrix")
async def manager_access_matrix(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    require_roles(identity, "GESTOR")
    return {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "rows": ACCESS_MATRIX,
    }


@app.get("/api/manager/dashboard")
async def manager_dashboard(identity: Identity = Depends(current_identity)) -> dict[str, Any]:
    """Entrega os dados consolidados usados pela interface padrão do gestor.

    A rota continua deliberadamente simples: lê as tabelas do Supabase,
    agrega os valores necessários para os gráficos e devolve JSON ao frontend.
    """
    require_roles(identity, "GESTOR")

    (
        units,
        patients,
        requests,
        queue,
        orders,
        deliveries,
        stock,
        shipments,
        recalls,
        providers,
        contracts,
        reports,
        municipalities,
        workshops,
        products,
        procedures,
        payments,
        partnerships,
        bpa_rows,
        apac_rows,
        device_inventory,
        matches,
    ) = await asyncio.gather(
        db_select(
            "dominio",
            "estabelecimento_cnes",
            select="codigo_cnes,municipio_ibge6,razao_social,nome_fantasia,tipo_estabelecimento,logradouro,telefone,habilitado_opm,ativo",
        ),
        db_select("fila", "paciente", select="id,municipio_residencia_ibge6,zona_residencia,data_cadastro,cns"),
        db_select(
            "fila",
            "solicitacao_ortese",
            select="id,status,data_solicitacao,estabelecimento_solicitante_cnes,cre_destino_cnes,paciente_id,procedimento_sigtap,produto_id,prioridade_clinica,distancia_estimada_cre_km",
        ),
        db_select(
            "fila",
            "fila_espera",
            select="id,solicitacao_id,data_entrada_fila,data_prevista_atendimento,data_saida_fila,posicao_prioridade,clock_pausado",
        ),
        db_select(
            "producao",
            "ordem_producao",
            select="id,solicitacao_id,oficina_id,produto_id,status,data_abertura,data_prevista_entrega,data_conclusao",
        ),
        db_select(
            "producao",
            "entrega_ortese",
            select="id,ordem_producao_id,data_entrega,termo_recebimento_assinado",
        ),
        db_select(
            "producao",
            "material_estoque",
            select="id,oficina_id,codigo_catmat,quantidade_atual,quantidade_minima,custo_unitario_medio",
        ),
        db_select(
            "producao",
            "remessa_logistica_reversa",
            select="id,oficina_id,status,quantidade,data_criacao,codigo_rastreio,tipo_dispositivo,fabricante_destino",
        ),
        db_select("app", "recall", order="data_abertura.desc", limit=100),
        db_select("app", "fornecedor", order="nome.asc"),
        db_select("app", "contrato_fornecedor", order="data_fim.desc"),
        db_select("app", "relatorio_gerado", order="gerado_em.desc", limit=100),
        db_select("dominio", "municipio_ibge", select="codigo_ibge6,uf_sigla,nome_municipio"),
        db_select(
            "producao",
            "oficina_ortopedica",
            select="id,cnes,nome,capacidade_producao_mensal,ativo",
        ),
        db_select("producao", "produto_ortese", select="id,procedimento_sigtap,nome_produto"),
        db_select("dominio", "sigtap_procedimento", select="codigo,nome_procedimento"),
        db_select(
            "faturamento",
            "guia_pagamento",
            select="id,bpa_individualizado_id,apac_id,competencia_faturamento,valor_procedimento,status_pagamento,data_processamento_datasus",
        ),
        db_select("app", "parceria_ong", select="id,oficina_id,nome_ong,tipo_parceria,data_inicio,data_fim,ativa"),
        db_select("faturamento", "bpa_individualizado", select="id,codigo_procedimento"),
        db_select("faturamento", "apac", select="id,procedimento_sigtap"),
        db_select("producao", "estoque_dispositivo", select="id,oficina_id,produto_id,numero_serie,data_validade,condicao,status,apto_reuso,cadastrado_em", order="cadastrado_em.desc", limit=5000),
        db_select("producao", "vw_matchings_cre", order="criado_em.desc", limit=5000),
    )

    region_by_uf = {
        "AC": "N", "AP": "N", "AM": "N", "PA": "N", "RO": "N", "RR": "N", "TO": "N",
        "AL": "NE", "BA": "NE", "CE": "NE", "MA": "NE", "PB": "NE", "PE": "NE", "PI": "NE", "RN": "NE", "SE": "NE",
        "DF": "CO", "GO": "CO", "MT": "CO", "MS": "CO",
        "ES": "SE", "MG": "SE", "RJ": "SE", "SP": "SE",
        "PR": "S", "RS": "S", "SC": "S",
    }
    region_order = ["N", "NE", "CO", "SE", "S", "—"]
    municipality_to_uf = {item.get("codigo_ibge6"): item.get("uf_sigla") or "—" for item in municipalities}
    municipality_to_name = {item.get("codigo_ibge6"): item.get("nome_municipio") or "—" for item in municipalities}
    municipality_to_region = {
        code: region_by_uf.get(uf, "—") for code, uf in municipality_to_uf.items()
    }
    unit_by_cnes = {item.get("codigo_cnes"): item for item in units}
    unit_to_region = {
        item.get("codigo_cnes"): municipality_to_region.get(item.get("municipio_ibge6"), "—")
        for item in units
    }
    patient_to_region = {
        item.get("id"): municipality_to_region.get(item.get("municipio_residencia_ibge6"), "—")
        for item in patients
    }
    patient_to_zone = {
        item.get("id"): (item.get("zona_residencia") or "URBANA")
        for item in patients
    }
    workshop_by_id = {item.get("id"): item for item in workshops}
    workshop_to_region = {
        item.get("id"): unit_to_region.get(item.get("cnes"), "—") for item in workshops
    }
    product_by_id = {item.get("id"): item for item in products}
    procedure_name = {item.get("codigo"): item.get("nome_procedimento") or "" for item in procedures}
    request_by_id = {item.get("id"): item for item in requests}
    order_by_id = {item.get("id"): item for item in orders}
    delivery_by_order = {item.get("ordem_producao_id"): item for item in deliveries}

    active_recalls = [item for item in recalls if item.get("status") not in {"ENCERRADO", "CANCELADO"}]
    active_orders = [item for item in orders if item.get("status") not in {"ENTREGUE", "CANCELADA"}]
    active_units = [item for item in units if item.get("ativo") is not False]
    low_stock = [item for item in stock if number(item.get("quantidade_atual")) <= number(item.get("quantidade_minima"))]
    active_shipments = [item for item in shipments if item.get("status") != "ENTREGUE"]

    completed_orders = [item for item in orders if item.get("status") == "ENTREGUE" or item.get("id") in delivery_by_order]
    signed_deliveries = [item for item in deliveries if item.get("termo_recebimento_assinado") is True]
    cancelled_requests = [item for item in requests if item.get("status") in {"CANCELADA", "NEGADA"}]
    delivered_requests = [item for item in requests if item.get("status") == "ENTREGUE"]

    conformity_rate = round(100 * (len(requests) - len(cancelled_requests)) / len(requests), 1) if requests else 0
    efficiency_rate = round(100 * len(delivered_requests) / len(requests), 1) if requests else 0
    damaged_expired_devices = [item for item in device_inventory if item.get("condicao") in {"DANIFICADO", "VENCIDO"} or (item.get("data_validade") and str(item.get("data_validade"))[:10] < date.today().isoformat())]
    completed_matches = [item for item in matches if item.get("status") == "CONCLUIDO"]
    active_queue_count = sum(1 for item in queue if not item.get("data_saida_fila"))
    sisreg_pending_count = sum(1 for item in requests if item.get("status") == "AGUARDANDO_AUTORIZACAO")
    summary = {
        "conformity_rate": conformity_rate,
        "efficiency_rate": efficiency_rate,
        "active_units": len(active_units),
        "patients": len(patients),
        "active_recalls": len(active_recalls),
        "logistics_alerts": len(active_shipments) + len(low_stock),
        "active_devices": len(active_orders),
        "delivered_requests": len(deliveries),
        "damaged_expired_devices": len(damaged_expired_devices),
        "reuse_matches": len(completed_matches),
        "pending_matches": sum(1 for item in matches if item.get("status") in {"PROPOSTO", "ACEITO", "EM_TRANSITO"}),
        "active_queue": active_queue_count,
        "sisreg_pending": sisreg_pending_count,
    }

    # Série mensal dos últimos 12 meses.
    months: dict[str, dict[str, Any]] = {}
    today = date.today()
    for offset in range(11, -1, -1):
        year = today.year
        month = today.month - offset
        while month <= 0:
            year -= 1
            month += 12
        key = f"{year:04d}-{month:02d}"
        months[key] = {"month": key, "requests": 0, "deliveries": 0, "cancelled": 0}
    for item in requests:
        key = date_key(item.get("data_solicitacao"))
        if key in months:
            months[key]["requests"] += 1
            if item.get("status") in {"CANCELADA", "NEGADA"}:
                months[key]["cancelled"] += 1
    for item in deliveries:
        key = date_key(item.get("data_entrega"))
        if key in months:
            months[key]["deliveries"] += 1
    monthly = list(months.values())
    health = []
    for row in monthly[-6:]:
        request_count = int(row["requests"])
        health.append({
            "month": row["month"],
            "conformity": round(100 * (request_count - int(row["cancelled"])) / request_count, 1) if request_count else 0,
            "efficiency": round(min(100 * int(row["deliveries"]) / request_count, 100), 1) if request_count else 0,
        })

    # Estoque, fila e trânsito por macrorregião.
    regional_map: dict[str, dict[str, Any]] = defaultdict(lambda: {"stock": 0, "queue": 0, "transit": 0, "units": 0})
    for unit in active_units:
        regional_map[unit_to_region.get(unit.get("codigo_cnes"), "—")]["units"] += 1
    for item in queue:
        request_item = request_by_id.get(item.get("solicitacao_id"), {})
        region = unit_to_region.get(request_item.get("cre_destino_cnes")) or patient_to_region.get(request_item.get("paciente_id")) or "—"
        if not item.get("data_saida_fila"):
            regional_map[region]["queue"] += 1
    for item in device_inventory:
        if item.get("status") in {"DISPONIVEL", "RESERVADO", "EM_TRANSFERENCIA", "BLOQUEADO"}:
            region = workshop_to_region.get(item.get("oficina_id"), "—")
            regional_map[region]["stock"] += 1
    for item in shipments:
        if item.get("status") != "ENTREGUE":
            region = workshop_to_region.get(item.get("oficina_id"), "—")
            regional_map[region]["transit"] += number(item.get("quantidade"))
    regional = [
        {"region": region, **regional_map[region]}
        for region in region_order
        if region in regional_map
    ]

    # Distribuição de pacientes por tipo de zona, como na interface padrão.
    zone_order = ["URBANA", "RURAL", "RIBEIRINHA", "REMOTA"]
    access_counts = Counter(patient_to_zone.get(item.get("id"), "URBANA") for item in patients)
    total_access = sum(access_counts.values())
    access_distribution = [
        {
            "name": zone,
            "value": round(100 * access_counts.get(zone, 0) / total_access, 1) if total_access else 0,
            "count": access_counts.get(zone, 0),
        }
        for zone in zone_order
    ]

    logistics_counter: dict[str, dict[str, float]] = defaultdict(lambda: {"count": 0, "devices": 0})
    for item in shipments:
        key = item.get("status") or "PENDENTE"
        logistics_counter[key]["count"] += 1
        logistics_counter[key]["devices"] += number(item.get("quantidade"))
    logistics = [{"status": key, **values} for key, values in logistics_counter.items()]

    contracts_by_provider: dict[Any, dict[str, Any]] = {}
    for item in contracts:
        provider_id = item.get("fornecedor_id")
        if provider_id not in contracts_by_provider:
            contracts_by_provider[provider_id] = item
    provider_rows = []
    for provider in providers:
        contract = contracts_by_provider.get(provider.get("id"), {})
        provider_rows.append({
            "id": provider.get("id"),
            "nome": provider.get("nome"),
            "numero_contrato": contract.get("numero_contrato"),
            "valor_total": contract.get("valor_total"),
            "data_inicio": contract.get("data_inicio"),
            "data_fim": contract.get("data_fim"),
            "status": contract.get("status") or ("ATIVO" if provider.get("ativo", True) else "INATIVO"),
            "sla_percentual": contract.get("sla_percentual"),
        })

    # Tempo de espera por região e pontos individuais de distância x espera.
    wait_days: dict[str, list[float]] = defaultdict(list)
    equity_points: list[dict[str, Any]] = []
    now = datetime.now()
    for item in queue:
        request_item = request_by_id.get(item.get("solicitacao_id"), {})
        patient_id = request_item.get("paciente_id")
        region = unit_to_region.get(request_item.get("cre_destino_cnes")) or patient_to_region.get(patient_id) or "—"
        start_raw = item.get("data_entrada_fila")
        end_raw = item.get("data_saida_fila")
        if not start_raw:
            continue
        try:
            start = datetime.fromisoformat(str(start_raw).replace("Z", "+00:00")).replace(tzinfo=None)
            end_date = datetime.fromisoformat(str(end_raw).replace("Z", "+00:00")).replace(tzinfo=None) if end_raw else now
            elapsed = max((end_date - start).total_seconds() / 86400, 0)
        except ValueError:
            continue
        wait_days[region].append(elapsed)
        distance = request_item.get("distancia_estimada_cre_km")
        if distance is not None:
            equity_points.append({
                "region": region,
                "zone": patient_to_zone.get(patient_id, "URBANA"),
                "distance_km": round(number(distance), 2),
                "wait_days": round(elapsed, 1),
            })
    equity = [
        {"region": region, "average_wait_days": round(sum(values) / len(values), 1), "queue_records": len(values)}
        for region, values in sorted(wait_days.items())
        if values
    ]

    # Indicadores de conformidade derivados de registros reais.
    payment_ok = [item for item in payments if item.get("status_pagamento") in {"PAGO", "APROVADO"}]
    on_time_orders = []
    for item in completed_orders:
        deadline = item.get("data_prevista_entrega")
        delivered = delivery_by_order.get(item.get("id"), {}).get("data_entrega") or item.get("data_conclusao")
        if not deadline or not delivered or str(delivered)[:10] <= str(deadline)[:10]:
            on_time_orders.append(item)
    compliance_scores = {
        "inventory": round(100 * (len(stock) - len(low_stock)) / len(stock), 1) if stock else 0,
        "privacy": round(100 * sum(1 for item in patients if item.get("cns")) / len(patients), 1) if patients else 0,
        "billing": round(100 * len(payment_ok) / len(payments), 1) if payments else 0,
        "traceability": round(100 * sum(1 for item in orders if item.get("solicitacao_id") and item.get("produto_id")) / len(orders), 1) if orders else 0,
        "delivery_docs": round(100 * len(signed_deliveries) / len(deliveries), 1) if deliveries else 0,
        "sla": round(100 * len(on_time_orders) / len(completed_orders), 1) if completed_orders else 0,
    }
    compliance = []
    for key, score in compliance_scores.items():
        status_value = "pass" if score >= 90 else "warning" if score >= 75 else "fail"
        compliance.append({"key": key, "status": status_value, "score": score})

    # Alertas nacionais estruturados para o frontend traduzir.
    alerts: list[dict[str, Any]] = []
    for item in active_recalls[:3]:
        alerts.append({
            "kind": "recall",
            "severity": "critical",
            "code": item.get("codigo_lote"),
            "product": item.get("nome_produto"),
            "date": item.get("data_abertura"),
            "status": item.get("status"),
            "target": "manager_lifecycle",
        })
    for item in low_stock[:3]:
        alerts.append({
            "kind": "low_stock",
            "severity": "warning",
            "code": item.get("codigo_catmat"),
            "current": number(item.get("quantidade_atual")),
            "minimum": number(item.get("quantidade_minima")),
            "target": "manager_logistics",
        })
    if active_shipments:
        alerts.append({
            "kind": "shipment",
            "severity": "warning",
            "count": len(active_shipments),
            "devices": int(sum(number(item.get("quantidade")) for item in active_shipments)),
            "target": "manager_logistics",
        })
    if reports:
        alerts.append({
            "kind": "report",
            "severity": "info",
            "name": reports[0].get("nome"),
            "date": reports[0].get("gerado_em"),
            "target": "manager_reports",
        })

    # Previsão simples de carga para os próximos seis meses, baseada na média real dos seis anteriores.
    request_type_counts: dict[str, dict[str, int]] = defaultdict(lambda: {"orthoses": 0, "prostheses": 0})
    for item in requests:
        month_key = date_key(item.get("data_solicitacao"))
        name = str(procedure_name.get(item.get("procedimento_sigtap"), "")).upper()
        category = "prostheses" if "PROTESE" in name or "PRÓTESE" in name else "orthoses"
        request_type_counts[month_key][category] += 1
    past_keys = [row["month"] for row in monthly[-6:]]
    avg_orthoses = round(sum(request_type_counts[key]["orthoses"] for key in past_keys) / max(len(past_keys), 1))
    avg_prostheses = round(sum(request_type_counts[key]["prostheses"] for key in past_keys) / max(len(past_keys), 1))
    maintenance_forecast = []
    for offset in range(1, 7):
        year = today.year
        month = today.month + offset
        while month > 12:
            year += 1
            month -= 12
        seasonal = 1 + ((offset % 3) - 1) * 0.04
        maintenance_forecast.append({
            "month": f"{year:04d}-{month:02d}",
            "orthoses": max(round(avg_orthoses * seasonal), 0),
            "prostheses": max(round(avg_prostheses * seasonal), 0),
        })

    lifecycle_alerts: list[dict[str, Any]] = []
    for item in active_recalls:
        lifecycle_alerts.append({
            "id": f"REC-{item.get('id')}",
            "patient": "—",
            "date": item.get("data_abertura"),
            "type": "recall",
            "status": item.get("status"),
            "description": item.get("nome_produto"),
        })
    for item in active_orders:
        deadline = item.get("data_prevista_entrega")
        if deadline and str(deadline)[:10] < today.isoformat():
            request_item = request_by_id.get(item.get("solicitacao_id"), {})
            lifecycle_alerts.append({
                "id": f"OP-{item.get('id')}",
                "patient": f"PAC-{request_item.get('paciente_id') or '—'}",
                "date": deadline,
                "type": "overdue",
                "status": item.get("status"),
                "description": product_by_id.get(item.get("produto_id"), {}).get("nome_produto"),
            })
    for item in damaged_expired_devices:
        lifecycle_alerts.append({
            "id": f"EST-{item.get('id')}", "patient": "—", "date": item.get("data_validade") or item.get("cadastrado_em"),
            "type": "damaged_expired", "status": item.get("condicao"),
            "description": product_by_id.get(item.get("produto_id"), {}).get("nome_produto"),
        })
    lifecycle_alerts = lifecycle_alerts[:100]

    # CREs: unidades habilitadas para OPM e/ou vinculadas a uma oficina ortopédica.
    active_orders_by_workshop = Counter(item.get("oficina_id") for item in active_orders)
    queue_by_cnes = Counter()
    for item in queue:
        if item.get("data_saida_fila"):
            continue
        request_item = request_by_id.get(item.get("solicitacao_id"), {})
        queue_by_cnes[request_item.get("cre_destino_cnes")] += 1
    shipments_by_workshop = Counter(item.get("oficina_id") for item in active_shipments)
    ngos_by_workshop = Counter(item.get("oficina_id") for item in partnerships if item.get("ativa") is not False)
    workshop_by_cnes = {item.get("cnes"): item for item in workshops}
    cre_cnes = {item.get("codigo_cnes") for item in units if item.get("habilitado_opm") is True}
    cre_cnes.update(item.get("cnes") for item in workshops if item.get("cnes"))
    centers = []
    for cnes in sorted(code for code in cre_cnes if code):
        unit = unit_by_cnes.get(cnes, {})
        workshop = workshop_by_cnes.get(cnes, {})
        workshop_id = workshop.get("id")
        capacity = int(number(workshop.get("capacidade_producao_mensal")))
        active_count = active_orders_by_workshop.get(workshop_id, 0) if workshop_id is not None else 0
        municipality_code = unit.get("municipio_ibge6")
        centers.append({
            "id": workshop_id,
            "name": workshop.get("nome") or unit.get("nome_fantasia") or unit.get("razao_social") or cnes,
            "cnes": cnes,
            "region": unit_to_region.get(cnes, "—"),
            "municipality": municipality_to_name.get(municipality_code, "—"),
            "uf": municipality_to_uf.get(municipality_code, "—"),
            "address": unit.get("logradouro"),
            "phone": unit.get("telefone"),
            "unit_type": unit.get("tipo_estabelecimento"),
            "opm_enabled": unit.get("habilitado_opm") is True,
            "capacity": capacity,
            "capacity_used": round(min(100 * active_count / capacity, 100), 1) if capacity else 0,
            "queue": queue_by_cnes.get(cnes, 0),
            "active_shipments": shipments_by_workshop.get(workshop_id, 0) if workshop_id is not None else 0,
            "ngo_partners": ngos_by_workshop.get(workshop_id, 0) if workshop_id is not None else 0,
            "active": unit.get("ativo") is not False and workshop.get("ativo", True) is not False,
        })
    summary["cre_centers"] = len([item for item in centers if item["active"]])

    # Série financeira por tipo de tecnologia assistiva, preservando o gráfico padrão.
    finance_months: dict[str, dict[str, Any]] = {}
    for row in monthly[-6:]:
        key = str(row["month"])
        finance_months[key] = {"month": key, "prostheses": 0, "orthoses": 0, "wheelchairs": 0, "hearing": 0}
    bpa_procedure = {item.get("id"): item.get("codigo_procedimento") for item in bpa_rows}
    apac_procedure = {item.get("id"): item.get("procedimento_sigtap") for item in apac_rows}
    for item in payments:
        # "Gasto" representa valor efetivamente aprovado/pago; pendências e glosas
        # não podem inflar o total financeiro da visão executiva.
        if item.get("status_pagamento") not in {"PAGO", "APROVADO"}:
            continue
        raw = str(item.get("competencia_faturamento") or "")
        key = f"{raw[:4]}-{raw[4:6]}" if len(raw) >= 6 else ""
        if key not in finance_months:
            continue
        code = bpa_procedure.get(item.get("bpa_individualizado_id")) or apac_procedure.get(item.get("apac_id"))
        name = str(procedure_name.get(code, "")).upper()
        amount = number(item.get("valor_procedimento"))
        if "AUDIT" in name or "AUDITIVO" in name:
            category = "hearing"
        elif "CADEIRA" in name or "RODAS" in name:
            category = "wheelchairs"
        elif "PROTESE" in name or "PRÓTESE" in name:
            category = "prostheses"
        else:
            category = "orthoses"
        finance_months[key][category] += amount


    manager_matches = [
        {
            "matching_id": item.get("matching_id"),
            "status": item.get("status"),
            "distancia_km": item.get("distancia_km"),
            "criado_em": item.get("criado_em"),
            "cre_origem_cnes": item.get("cre_origem_cnes"),
            "cre_origem_nome": item.get("cre_origem_nome"),
            "cre_destino_cnes": item.get("cre_destino_cnes"),
            "cre_destino_nome": item.get("cre_destino_nome"),
            "nome_produto": item.get("nome_produto"),
        }
        for item in matches
    ]

    return {
        "summary": summary,
        "monthly": monthly,
        "health": health,
        "regional": regional,
        "access_distribution": access_distribution,
        "alerts": alerts,
        "compliance": compliance,
        "maintenance_forecast": maintenance_forecast,
        "lifecycle_alerts": lifecycle_alerts,
        "logistics": logistics,
        "centers": centers,
        "finance_monthly": list(finance_months.values()),
        "providers": provider_rows,
        "equity": equity,
        "equity_points": equity_points,
        "recalls": recalls,
        "reports": reports,
        "access_matrix": ACCESS_MATRIX,
        "matches": manager_matches,
        "generated_at": datetime.now().isoformat(),
    }
