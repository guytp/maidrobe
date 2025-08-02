using Microsoft.AspNetCore.Mvc;
using Infrastructure.Data;
using Domain;
using System;
using System.Threading.Tasks;

namespace API.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class TestController : ControllerBase
    {
        private readonly IMongoRepository<TestEntity> _repository;

        public TestController(IMongoRepository<TestEntity> repository)
        {
            _repository = repository ?? throw new ArgumentNullException(nameof(repository));
        }

        [HttpGet("test-injection")]
        public IActionResult TestInjection()
        {
            try
            {
                return Ok(new
                {
                    message = "Repository successfully injected",
                    repositoryType = _repository.GetType().Name,
                    isBaseMongoRepository = _repository is BaseMongoRepository<TestEntity>
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "An error occurred", message = ex.Message });
            }
        }

        [HttpGet("{id}")]
        public async Task<IActionResult> Get(Guid id)
        {
            try
            {
                var entity = await _repository.GetByIdAsync(id);
                if (entity == null)
                {
                    return NotFound(new { error = $"Entity with ID {id} not found" });
                }
                return Ok(entity);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "An error occurred while retrieving the entity", message = ex.Message });
            }
        }

        [HttpPost]
        public async Task<IActionResult> Create([FromBody] TestEntity entity)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                var created = await _repository.CreateAsync(entity);
                return CreatedAtAction(nameof(Get), new { id = created.Id }, created);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "An error occurred while creating the entity", message = ex.Message });
            }
        }

        [HttpPut("{id}")]
        public async Task<IActionResult> Update(Guid id, [FromBody] TestEntity entity)
        {
            try
            {
                if (!ModelState.IsValid)
                {
                    return BadRequest(ModelState);
                }

                if (id != entity.Id)
                {
                    return BadRequest(new { error = "ID mismatch" });
                }

                var updated = await _repository.UpdateAsync(entity);
                return Ok(updated);
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "An error occurred while updating the entity", message = ex.Message });
            }
        }

        [HttpDelete("{id}")]
        public async Task<IActionResult> Delete(Guid id)
        {
            try
            {
                await _repository.DeleteAsync(id);
                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "An error occurred while deleting the entity", message = ex.Message });
            }
        }

        [HttpPatch("{id}")]
        public async Task<IActionResult> Patch(Guid id, [FromBody] object updates)
        {
            try
            {
                await _repository.PatchAsync(id, updates);
                return NoContent();
            }
            catch (InvalidOperationException ex)
            {
                return NotFound(new { error = ex.Message });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { error = "An error occurred while patching the entity", message = ex.Message });
            }
        }
    }
}