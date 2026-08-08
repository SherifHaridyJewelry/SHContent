"""Template endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.schemas import (
    DistillSceneRefRequest,
    ScenePlateJob,
    TemplateSceneReferenceReorderRequest,
    TemplateSceneReferenceRequest,
    TemplateSceneReferenceResult,
    TemplateStyleReferenceRequest,
    TemplateStyleReferenceResult,
    TemplateSummary,
)
from app.services import scene_plate_service, template_service

router = APIRouter(prefix="/templates", tags=["templates"])


@router.get("", response_model=list[TemplateSummary])
def list_templates() -> list[TemplateSummary]:
    return template_service.list_templates()


@router.get("/{name}")
def get_template(name: str) -> dict:
    return template_service.get_template(name)


@router.post("/{name}/style-references", response_model=TemplateStyleReferenceResult)
def add_style_references(
    name: str,
    data: TemplateStyleReferenceRequest,
) -> TemplateStyleReferenceResult:
    return TemplateStyleReferenceResult(
        **template_service.add_style_references(
            name,
            output_paths=data.output_paths,
            urls=data.urls,
        )
    )


@router.post("/{name}/scene-references", response_model=TemplateSceneReferenceResult)
def add_scene_references(
    name: str,
    data: TemplateSceneReferenceRequest,
) -> TemplateSceneReferenceResult:
    try:
        result = template_service.add_scene_references(
            name,
            product_type=data.product_type,
            output_paths=data.output_paths,
            urls=data.urls,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return TemplateSceneReferenceResult(**result)


@router.delete("/{name}/scene-references", response_model=TemplateSceneReferenceResult)
def remove_scene_reference(
    name: str,
    product_type: str,
    url: str,
) -> TemplateSceneReferenceResult:
    try:
        result = template_service.remove_scene_reference(
            name, product_type=product_type, url=url
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return TemplateSceneReferenceResult(**result)


@router.put("/{name}/scene-references/reorder", response_model=TemplateSceneReferenceResult)
def reorder_scene_reference(
    name: str,
    data: TemplateSceneReferenceReorderRequest,
) -> TemplateSceneReferenceResult:
    try:
        result = template_service.reorder_scene_reference(
            name,
            product_type=data.product_type,
            url=data.url,
            direction=data.direction,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    return TemplateSceneReferenceResult(**result)


@router.post("/{name}/scene-plates/distill", response_model=ScenePlateJob)
def distill_scene_ref(
    name: str,
    data: DistillSceneRefRequest,
) -> ScenePlateJob:
    try:
        return scene_plate_service.start_distillation(
            name,
            output_path=data.output_path,
            scene_key=data.scene_key,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
