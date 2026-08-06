from pydantic import BaseModel


class ResourceBase(BaseModel):
    name: str
    category: str
    location: str
    available: bool = True


class ResourceCreate(ResourceBase):
    pass


class Resource(ResourceBase):
    id: int

    class Config:
        orm_mode = True
