package model

type StaffMember struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Role     string  `json:"role"`
	BranchID *string `json:"branch_id"`
}

type Shift struct {
	ID       string  `json:"id"`
	StaffID  string  `json:"staff_id"`
	StaffName string `json:"staff_name,omitempty"`
	Day      string  `json:"day"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Role     string  `json:"role"`
	BranchID *string `json:"branch_id"`
}

type CreateStaffRequest struct {
	Name string `json:"name" binding:"required"`
	Role string `json:"role" binding:"required"`
}

type CreateShiftRequest struct {
	StaffID   string `json:"staff_id" binding:"required"`
	Day       string `json:"day" binding:"required"`
	StartTime string `json:"start_time" binding:"required"`
	EndTime   string `json:"end_time" binding:"required"`
	Role      string `json:"role" binding:"required"`
}

type UpdateShiftRequest struct {
	Day       string `json:"day"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
	Role      string `json:"role"`
}
