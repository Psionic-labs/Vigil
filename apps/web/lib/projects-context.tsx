/**
 * @file projects-context.tsx
 * @description React context holding active and listed projects.
 * @why Synchronizes project state across pages, sidebars, and top navigation.
 */

"use client"
import { createContext, useContext, useEffect, useState } from "react"

export interface Project {
  id: string
  name: string
  publicKey: string
  createdAt: number
}

interface ProjectsContextType {
  projects: Project[]
  activeProject: Project | null
  isLoading: boolean
  setActiveProjectId: (id: string) => void
  createProject: (name: string) => Promise<Project>
  refreshProjects: () => Promise<void>
}

const ProjectsContext = createContext<ProjectsContextType | null>(null)

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([])
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/projects`)
      if (!res.ok) throw new Error("Failed to fetch projects")
      const { data } = await res.json()
      return data as Project[]
    } catch (err) {
      console.error(err)
      return []
    }
  }

  const refreshProjects = async () => {
    setIsLoading(true)
    const data = await fetchProjects()
    setProjects(data)

    // Handle active project selection
    const savedId = localStorage.getItem("vigil_active_project")
    if (savedId && data.find(p => p.id === savedId)) {
      setActiveProjectIdState(savedId)
    } else if (data.length > 0) {
      setActiveProjectIdState(data[0].id)
      localStorage.setItem("vigil_active_project", data[0].id)
    } else {
      setActiveProjectIdState(null)
      localStorage.removeItem("vigil_active_project")
    }
    
    setIsLoading(false)
  }

  useEffect(() => {
    refreshProjects()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const setActiveProjectId = (id: string) => {
    setActiveProjectIdState(id)
    localStorage.setItem("vigil_active_project", id)
  }

  const createProject = async (name: string): Promise<Project> => {
    const res = await fetch(`${API_BASE_URL}/api/v1/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
    
    if (!res.ok) throw new Error("Failed to create project")
    
    const { data } = await res.json()
    const newProject = data as Project
    
    // Add to list and select it
    setProjects(prev => [newProject, ...prev])
    setActiveProjectId(newProject.id)
    
    return newProject
  }

  const activeProject = projects.find(p => p.id === activeProjectId) || null

  return (
    <ProjectsContext.Provider 
      value={{ 
        projects, 
        activeProject, 
        isLoading, 
        setActiveProjectId, 
        createProject, 
        refreshProjects 
      }}
    >
      {children}
    </ProjectsContext.Provider>
  )
}

export function useProjects() {
  const context = useContext(ProjectsContext)
  if (!context) {
    throw new Error("useProjects must be used within a ProjectsProvider")
  }
  return context
}
